"""
file_handler.py — Gestión de archivos subidos por el usuario.

Responsabilidades:
- Validar tipo MIME y tamaño antes de procesar
- Guardar uploads en TEMP_DIR con nombre único
- Limpiar archivos temporales después de usarlos
- Programar cleanup automático por TTL

Diseñado para Render donde el disco es efímero y limitado.
"""

import logging
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from app.core.config import (
    ALLOWED_IMAGE_TYPES,
    ALLOWED_VIDEO_TYPES,
    MAX_IMAGE_BYTES,
    MAX_VIDEO_BYTES,
    TEMP_DIR,
)

logger = logging.getLogger(__name__)


async def validate_and_save_image(file: UploadFile) -> Path:
    """
    Valida un upload de imagen y lo guarda en disco temporalmente.

    Raises:
        HTTPException 415 si el tipo MIME no está permitido
        HTTPException 413 si el tamaño supera el límite
        HTTPException 400 si el archivo está vacío o corrupto
    """
    # Validar content type
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Tipo de imagen no soportado: '{file.content_type}'. "
                f"Formatos aceptados: JPEG, PNG, WebP."
            ),
        )

    content = await file.read()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo de imagen está vacío.",
        )

    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=(
                f"Imagen demasiado grande: "
                f"{len(content) / 1024 / 1024:.1f}MB. "
                f"Máximo permitido: {MAX_IMAGE_BYTES // 1024 // 1024}MB."
            ),
        )

    # Guardar temporalmente con extensión correcta
    ext      = _mime_to_ext(file.content_type, is_video=False)
    tmp_path = TEMP_DIR / f"{uuid.uuid4().hex}{ext}"
    tmp_path.write_bytes(content)

    logger.debug(f"Imagen guardada: {tmp_path.name} ({len(content) / 1024:.1f}KB)")
    return tmp_path


async def validate_and_save_video(file: UploadFile) -> Path:
    """
    Valida un upload de video y lo guarda en disco temporalmente.

    Raises:
        HTTPException 415 si el tipo MIME no está permitido
        HTTPException 413 si el tamaño supera el límite
    """
    if file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"Tipo de video no soportado: '{file.content_type}'. "
                f"Formatos aceptados: MP4, AVI, MOV."
            ),
        )

    # Leer en chunks para no saturar RAM con videos grandes
    chunks:     list[bytes] = []
    total_size: int         = 0
    chunk_size: int         = 1024 * 1024  # 1MB por chunk

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_VIDEO_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"Video demasiado grande. "
                    f"Máximo permitido: {MAX_VIDEO_BYTES // 1024 // 1024}MB."
                ),
            )
        chunks.append(chunk)

    if total_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo de video está vacío.",
        )

    content  = b"".join(chunks)
    ext      = _mime_to_ext(file.content_type, is_video=True)
    tmp_path = TEMP_DIR / f"{uuid.uuid4().hex}{ext}"
    tmp_path.write_bytes(content)

    logger.debug(f"Video guardado: {tmp_path.name} ({total_size / 1024 / 1024:.1f}MB)")
    return tmp_path


def safe_delete(path: Path) -> None:
    """Elimina un archivo temporal sin lanzar excepción si falla."""
    try:
        if path and path.exists():
            path.unlink()
            logger.debug(f"Eliminado: {path.name}")
    except OSError as e:
        logger.warning(f"No se pudo eliminar {path}: {e}")


def _mime_to_ext(mime_type: str, is_video: bool) -> str:
    """Mapea content-type a extensión de archivo."""
    image_map = {
        "image/jpeg": ".jpg",
        "image/png":  ".png",
        "image/webp": ".webp",
    }
    video_map = {
        "video/mp4":       ".mp4",
        "video/avi":       ".avi",
        "video/quicktime": ".mov",
    }
    mapping = video_map if is_video else image_map
    return mapping.get(mime_type, ".bin")
