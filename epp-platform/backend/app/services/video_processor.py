"""
video_processor.py — Procesamiento de video frame a frame.

Optimizado para Render free tier (512MB RAM, CPU compartido):
- Redimensiona frames grandes antes de procesar (máx 1280px ancho)
- Libera memoria explícitamente entre frames
- Frame skipping agresivo para reducir carga
- Límite de frames para evitar timeouts
"""

import asyncio
import gc
import logging
import subprocess
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from app.core.config import (
    TEMP_DIR,
    VIDEO_FRAME_SKIP,
    VIDEO_MAX_FRAMES,
    WS_JPEG_QUALITY,
)
from app.services.compliance import ComplianceResult, aggregate_video_compliance
from app.services.detector import DetectionResult, detect_frame

logger = logging.getLogger(__name__)

# Un solo worker para no duplicar uso de memoria
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="video_worker")

# FIX memoria: limitar resolución máxima de procesamiento
MAX_WIDTH  = 1280
MAX_HEIGHT = 720


@dataclass
class VideoMetadata:
    width:        int
    height:       int
    fps:          float
    total_frames: int
    duration_sec: float


@dataclass
class VideoProcessingResult:
    job_id:              str
    output_path:         Path
    metadata:            VideoMetadata
    compliance:          ComplianceResult
    frame_results:       list[ComplianceResult]
    frames_processed:    int
    frames_skipped:      int
    processing_time_sec: float
    output_size_bytes:   int = 0


def _get_video_metadata(cap: cv2.VideoCapture) -> VideoMetadata:
    width    = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps      = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total    = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps if fps > 0 else 0.0
    return VideoMetadata(
        width=width, height=height,
        fps=fps, total_frames=total,
        duration_sec=round(duration, 2),
    )


def _resize_if_needed(frame: np.ndarray) -> np.ndarray:
    """
    FIX memoria: redimensiona frames grandes para que quepan en 512MB.
    Un frame 4K (3840x2160) ocupa ~25MB solo en RAM.
    Limitando a 1280x720 baja a ~2.8MB por frame.
    """
    h, w = frame.shape[:2]
    if w <= MAX_WIDTH and h <= MAX_HEIGHT:
        return frame

    scale = min(MAX_WIDTH / w, MAX_HEIGHT / h)
    new_w = int(w * scale)
    new_h = int(h * scale)
    return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _process_video_sync(
    input_path:  Path,
    job_id:      str,
    frame_skip:  int,
    max_frames:  int,
    progress_cb: Callable[[int, int], None] | None = None,
) -> VideoProcessingResult:
    t_start = time.perf_counter()

    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError(f"No se pudo abrir el video: {input_path}")

    meta = _get_video_metadata(cap)
    logger.info(
        f"[{job_id}] Video: {meta.width}x{meta.height} "
        f"@ {meta.fps:.1f}fps | {meta.total_frames} frames"
    )

    # Calcular dimensiones de output (respetando límite de memoria)
    scale      = min(MAX_WIDTH / meta.width, MAX_HEIGHT / meta.height, 1.0)
    out_width  = int(meta.width  * scale)
    out_height = int(meta.height * scale)
    logger.info(f"[{job_id}] Output resolución: {out_width}x{out_height} (scale={scale:.2f})")

    tmp_avi = TEMP_DIR / f"{job_id}_tmp.avi"
    out_mp4 = TEMP_DIR / f"{job_id}_result.mp4"

    fourcc = cv2.VideoWriter_fourcc(*"MJPG")
    writer = cv2.VideoWriter(
        str(tmp_avi), fourcc, meta.fps, (out_width, out_height)
    )

    frame_results:   list[ComplianceResult] = []
    frames_processed = 0
    frames_skipped   = 0
    frame_idx        = 0

    try:
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            if frames_processed >= max_frames:
                logger.info(f"[{job_id}] Límite de frames alcanzado ({max_frames})")
                break

            # FIX memoria: redimensionar antes de procesar
            frame = _resize_if_needed(frame)

            if frame_idx % frame_skip != 0:
                writer.write(frame)
                frames_skipped += 1
                frame_idx += 1
                # FIX memoria: liberar frame explícitamente
                del frame
                continue

            # Detección en este frame
            detection = detect_frame(frame, frame_index=frame_idx)
            writer.write(detection.annotated_frame)
            frame_results.append(detection.compliance)
            frames_processed += 1
            frame_idx += 1

            # FIX memoria: liberar frames procesados
            del frame
            del detection

            # Forzar GC cada 100 frames para evitar acumulación
            if frames_processed % 100 == 0:
                gc.collect()
                logger.info(f"[{job_id}] Progreso: {frames_processed} frames procesados")

            if progress_cb and frames_processed % 30 == 0:
                progress_cb(frames_processed, min(max_frames, meta.total_frames))

    finally:
        cap.release()
        writer.release()
        gc.collect()

    video_compliance = aggregate_video_compliance(frame_results)

    logger.info(f"[{job_id}] Convirtiendo a MP4 H.264...")
    _convert_to_mp4(tmp_avi, out_mp4)

    if tmp_avi.exists():
        tmp_avi.unlink()

    output_size     = out_mp4.stat().st_size if out_mp4.exists() else 0
    processing_time = time.perf_counter() - t_start

    logger.info(
        f"[{job_id}] Procesado en {processing_time:.1f}s | "
        f"{frames_processed} frames | compliance: {video_compliance.compliance_pct}%"
    )

    return VideoProcessingResult(
        job_id=job_id,
        output_path=out_mp4,
        metadata=meta,
        compliance=video_compliance,
        frame_results=frame_results,
        frames_processed=frames_processed,
        frames_skipped=frames_skipped,
        processing_time_sec=round(processing_time, 2),
        output_size_bytes=output_size,
    )


def _convert_to_mp4(input_avi: Path, output_mp4: Path) -> None:
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_avi),
        "-vcodec", "libx264",
        "-crf", "28",        # FIX memoria: crf más alto = menos memoria en encoding
        "-preset", "ultrafast",  # FIX memoria: ultrafast usa mucho menos RAM que fast
        "-movflags", "+faststart",
        "-loglevel", "error",
        str(output_mp4),
    ]
    try:
        subprocess.run(cmd, check=True, timeout=300)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"ffmpeg falló convirtiendo video: {e}") from e
    except FileNotFoundError:
        raise RuntimeError("ffmpeg no encontrado. Instálalo: apt-get install ffmpeg")


async def process_video_async(
    input_path:  Path,
    frame_skip:  int   = VIDEO_FRAME_SKIP,
    max_frames:  int   = VIDEO_MAX_FRAMES,
    progress_cb: Callable[[int, int], None] | None = None,
) -> VideoProcessingResult:
    job_id = str(uuid.uuid4())[:8]
    loop   = asyncio.get_event_loop()

    logger.info(f"[{job_id}] Iniciando procesamiento async: {input_path.name}")

    result = await loop.run_in_executor(
        _executor,
        lambda: _process_video_sync(
            input_path=input_path,
            job_id=job_id,
            frame_skip=frame_skip,
            max_frames=max_frames,
            progress_cb=progress_cb,
        ),
    )
    return result


def cleanup_temp_file(path: Path) -> None:
    try:
        if path.exists():
            path.unlink()
            logger.debug(f"Temp eliminado: {path.name}")
    except OSError as e:
        logger.warning(f"No se pudo eliminar {path}: {e}")


def encode_frame_jpeg(frame: np.ndarray, quality: int = WS_JPEG_QUALITY) -> bytes:
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buffer.tobytes()