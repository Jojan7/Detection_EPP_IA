"""
video_processor.py — Procesamiento de video frame a frame.

Diseñado para Render (CPU sin GPU):
- Procesamiento en thread pool para no bloquear el event loop de FastAPI
- Frame skipping configurable para controlar carga de CPU
- Límite de frames para evitar timeouts en videos largos
- Cleanup automático de archivos temporales
- Progreso reportable via callback (para futura integración con WebSocket)
"""

import asyncio
import logging
import os
import subprocess
import tempfile
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
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

# Thread pool para procesamiento CPU-intensivo sin bloquear asyncio
# max_workers=2 en Render free tier (512MB RAM, 0.1 CPU compartido)
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="video_worker")


@dataclass
class VideoMetadata:
    """Información técnica del video de entrada."""
    width:       int
    height:      int
    fps:         float
    total_frames: int
    duration_sec: float


@dataclass
class VideoProcessingResult:
    """Resultado completo del procesamiento de un video."""
    job_id:          str
    output_path:     Path
    metadata:        VideoMetadata
    compliance:      ComplianceResult          # resultado agregado del video
    frame_results:   list[ComplianceResult]    # uno por frame procesado
    frames_processed: int
    frames_skipped:   int
    processing_time_sec: float
    output_size_bytes:   int = 0


def _get_video_metadata(cap: cv2.VideoCapture) -> VideoMetadata:
    """Extrae metadata de un VideoCapture ya abierto."""
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps    = cap.get(cv2.CAP_PROP_FPS) or 25.0
    total  = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total / fps if fps > 0 else 0.0

    return VideoMetadata(
        width=width, height=height,
        fps=fps, total_frames=total,
        duration_sec=round(duration, 2),
    )


def _process_video_sync(
    input_path:    Path,
    job_id:        str,
    frame_skip:    int,
    max_frames:    int,
    progress_cb:   Callable[[int, int], None] | None = None,
) -> VideoProcessingResult:
    """
    Procesamiento síncrono de video (se ejecuta en thread pool).

    Flujo:
    1. Abrir video con OpenCV
    2. Procesar cada N frames con detección EPP
    3. Escribir frame anotado a archivo temporal AVI (MJPG, rápido)
    4. Convertir AVI → MP4 H.264 con ffmpeg (compatible con browsers)
    5. Limpiar temporal AVI
    6. Retornar resultado con compliance agregado

    Args:
        input_path:  ruta al video de entrada
        job_id:      identificador único del job
        frame_skip:  procesar 1 de cada N frames
        max_frames:  límite de frames a procesar
        progress_cb: callback(frames_done, total_frames) para progreso
    """
    t_start = time.perf_counter()

    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        raise RuntimeError(f"No se pudo abrir el video: {input_path}")

    meta = _get_video_metadata(cap)
    logger.info(
        f"[{job_id}] Video: {meta.width}x{meta.height} "
        f"@ {meta.fps:.1f}fps | {meta.total_frames} frames"
    )

    # Rutas de output
    tmp_avi  = TEMP_DIR / f"{job_id}_tmp.avi"
    out_mp4  = TEMP_DIR / f"{job_id}_result.mp4"

    # Writer temporal en MJPG (rápido para escritura frame a frame)
    fourcc = cv2.VideoWriter_fourcc(*"MJPG")
    writer = cv2.VideoWriter(
        str(tmp_avi), fourcc, meta.fps, (meta.width, meta.height)
    )

    frame_results:  list[ComplianceResult] = []
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

            # Frame skip: procesar 1 de cada N
            if frame_idx % frame_skip != 0:
                # Para frames saltados: copiar frame original sin anotar
                writer.write(frame)
                frames_skipped += 1
                frame_idx += 1
                continue

            # Detección en este frame
            detection = detect_frame(frame, frame_index=frame_idx)
            writer.write(detection.annotated_frame)
            frame_results.append(detection.compliance)
            frames_processed += 1
            frame_idx += 1

            # Callback de progreso cada 30 frames
            if progress_cb and frames_processed % 30 == 0:
                progress_cb(frames_processed, min(max_frames, meta.total_frames))

    finally:
        cap.release()
        writer.release()

    # Agregar compliance del video completo
    video_compliance = aggregate_video_compliance(frame_results)

    # Convertir AVI → MP4 H.264 para compatibilidad web
    logger.info(f"[{job_id}] Convirtiendo a MP4 H.264...")
    _convert_to_mp4(tmp_avi, out_mp4)

    # Limpiar temporal AVI
    if tmp_avi.exists():
        tmp_avi.unlink()

    output_size = out_mp4.stat().st_size if out_mp4.exists() else 0
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
    """
    Convierte AVI → MP4 H.264 usando ffmpeg.

    Parámetros elegidos para Render:
    - libx264: codec universal, disponible en Ubuntu sin extras
    - crf=23: calidad razonable, buen balance tamaño/calidad
    - preset=fast: más rápido que medium, aceptable en CPU
    - movflags +faststart: metadata al inicio, streaming web eficiente
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_avi),
        "-vcodec", "libx264",
        "-crf", "23",
        "-preset", "fast",
        "-movflags", "+faststart",
        "-loglevel", "error",
        str(output_mp4),
    ]
    try:
        subprocess.run(cmd, check=True, timeout=300)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"ffmpeg falló convirtiendo video: {e}") from e
    except FileNotFoundError:
        raise RuntimeError(
            "ffmpeg no encontrado. Instálalo: apt-get install ffmpeg"
        )


async def process_video_async(
    input_path:  Path,
    frame_skip:  int   = VIDEO_FRAME_SKIP,
    max_frames:  int   = VIDEO_MAX_FRAMES,
    progress_cb: Callable[[int, int], None] | None = None,
) -> VideoProcessingResult:
    """
    Procesa un video de forma asíncrona sin bloquear el event loop.

    Delega el trabajo pesado al thread pool y retorna un awaitable.
    Esta es la función que llaman los endpoints de FastAPI.

    Args:
        input_path:  ruta al video subido
        frame_skip:  procesar 1 de cada N frames (1 = todos)
        max_frames:  límite de seguridad de frames a procesar
        progress_cb: callback opcional para progreso en tiempo real
    """
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
    """Elimina un archivo temporal de forma segura."""
    try:
        if path.exists():
            path.unlink()
            logger.debug(f"Temp eliminado: {path.name}")
    except OSError as e:
        logger.warning(f"No se pudo eliminar {path}: {e}")


def encode_frame_jpeg(frame: np.ndarray, quality: int = WS_JPEG_QUALITY) -> bytes:
    """
    Codifica un frame numpy como JPEG bytes.
    Usado para streaming WebSocket y previews de imagen.
    """
    _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
    return buffer.tobytes()
