"""
videos.py — Endpoints de detección EPP en video.

POST /detect/video
  - Recibe video (MP4/AVI/MOV)
  - Procesa frame a frame de forma asíncrona
  - Retorna compliance agregado + URL de descarga del video anotado

GET /detect/video/{job_id}/download
  - Descarga el video procesado
  - Elimina el archivo después de servido (Render: disco limitado)
"""

import logging
import uuid

from fastapi import APIRouter, BackgroundTasks, File, Query, UploadFile
from fastapi.responses import FileResponse

from app.api.routes.images import _build_compliance_schema
from app.api.schemas import ProcessingStatus, VideoDetectionResponse
from app.core.config import VIDEO_FRAME_SKIP, VIDEO_MAX_FRAMES
from app.services.video_processor import cleanup_temp_file, process_video_async
from app.utils.file_handler import safe_delete, validate_and_save_video

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/detect", tags=["Detection"])


@router.post(
    "/video",
    response_model=VideoDetectionResponse,
    summary="Detectar EPP en video",
    description=(
        "Sube un video y recibe análisis EPP completo frame a frame. "
        "El video procesado con anotaciones queda disponible para descarga. "
        "Tiempo de procesamiento: ~1-3 min por minuto de video (CPU)."
    ),
)
async def detect_video(
    background_tasks: BackgroundTasks,
    file:         UploadFile = File(..., description="Video a analizar"),
    frame_skip:   int        = Query(
        default=VIDEO_FRAME_SKIP,
        ge=1, le=10,
        description="Procesar 1 de cada N frames. Mayor valor = más rápido pero menos preciso.",
    ),
):
    input_path = None
    try:
        # 1. Validar y guardar video
        input_path = await validate_and_save_video(file)

        # 2. Procesar video de forma asíncrona (thread pool)
        result = await process_video_async(
            input_path=input_path,
            frame_skip=frame_skip,
            max_frames=VIDEO_MAX_FRAMES,
        )

        # 3. Serializar compliance del video completo
        compliance_schema = _build_compliance_schema(result.compliance)

        # 4. URL de descarga del video resultante
        download_url = f"/detect/video/{result.job_id}/download"

        return VideoDetectionResponse(
            job_id=result.job_id,
            status=ProcessingStatus.DONE,
            compliance=compliance_schema,
            frames_processed=result.frames_processed,
            frames_skipped=result.frames_skipped,
            processing_time_sec=result.processing_time_sec,
            output_size_kb=round(result.output_size_bytes / 1024, 1),
            download_url=download_url,
            video_width=result.metadata.width,
            video_height=result.metadata.height,
            video_fps=result.metadata.fps,
            video_duration=result.metadata.duration_sec,
        )

    finally:
        # Limpiar el video de entrada (ya no se necesita)
        if input_path:
            safe_delete(input_path)


@router.get(
    "/video/{job_id}/download",
    summary="Descargar video procesado",
    description="Descarga el video con anotaciones EPP. El archivo se elimina después de servido.",
    responses={
        200: {"content": {"video/mp4": {}}},
        404: {"description": "Video no encontrado o ya descargado"},
    },
)
async def download_video(
    job_id:           str,
    background_tasks: BackgroundTasks,
):
    from app.core.config import TEMP_DIR
    from fastapi import HTTPException

    output_path = TEMP_DIR / f"{job_id}_result.mp4"

    if not output_path.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Video '{job_id}' no encontrado. "
                "Puede que ya haya sido descargado o que el procesamiento no haya terminado."
            ),
        )

    # Programar eliminación del archivo DESPUÉS de enviarlo
    # BackgroundTask garantiza que se ejecuta tras completar el response
    background_tasks.add_task(cleanup_temp_file, output_path)

    return FileResponse(
        path=str(output_path),
        media_type="video/mp4",
        filename=f"epp_resultado_{job_id}.mp4",
        headers={"Content-Disposition": f'attachment; filename="epp_resultado_{job_id}.mp4"'},
    )
