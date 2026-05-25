"""
images.py — Endpoint de detección EPP en imágenes.

POST /detect/image
  - Acepta imagen (JPEG, PNG, WebP)
  - Retorna compliance + bounding boxes + imagen anotada en base64
"""

import base64
import logging
import uuid

import cv2
import numpy as np
from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from app.api.schemas import (
    BoundingBoxSchema,
    ComplianceSchema,
    EPPItemSchema,
    ImageDetectionResponse,
)
from app.services.detector import detect_image_bytes
from app.utils.file_handler import safe_delete, validate_and_save_image

logger  = logging.getLogger(__name__)
router  = APIRouter(prefix="/detect", tags=["Detection"])


@router.post(
    "/image",
    response_model=ImageDetectionResponse,
    summary="Detectar EPP en imagen",
    description=(
        "Sube una imagen (JPEG/PNG/WebP) y recibe el análisis EPP completo: "
        "cumplimiento normativa, EPP detectados/faltantes, bounding boxes "
        "e imagen anotada en base64."
    ),
)
async def detect_image(
    file: UploadFile = File(..., description="Imagen a analizar"),
):
    tmp_path = None
    try:
        # 1. Validar y guardar upload
        tmp_path = await validate_and_save_image(file)

        # 2. Leer bytes y ejecutar detección
        image_bytes = tmp_path.read_bytes()
        result      = detect_image_bytes(image_bytes)

        # 3. Codificar imagen anotada a base64
        _, buffer  = cv2.imencode(".jpg", result.annotated_frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
        image_b64  = base64.b64encode(buffer.tobytes()).decode("utf-8")

        # 4. Serializar compliance
        compliance_schema = _build_compliance_schema(result.compliance)

        # 5. Serializar bounding boxes
        boxes_schema = [
            BoundingBoxSchema(
                x1=b.x1, y1=b.y1, x2=b.x2, y2=b.y2,
                class_name=b.class_name,
                confidence=round(b.confidence, 4),
                class_id=b.class_id,
            )
            for b in result.boxes
        ]

        return ImageDetectionResponse(
            job_id=uuid.uuid4().hex[:8],
            compliance=compliance_schema,
            boxes=boxes_schema,
            inference_ms=result.inference_ms,
            image_b64=image_b64,
        )

    finally:
        # Limpiar siempre el archivo temporal
        if tmp_path:
            safe_delete(tmp_path)


def _build_compliance_schema(compliance) -> ComplianceSchema:
    """Convierte ComplianceResult (dataclass) → ComplianceSchema (Pydantic)."""
    return ComplianceSchema(
        status=compliance.status,
        compliant=compliance.compliant,
        compliance_pct=compliance.compliance_pct,
        compliance_rate=compliance.compliance_rate,
        epp_items=[
            EPPItemSchema(
                key=item.key,
                label=item.label,
                icon=item.icon,
                present=item.present,
                class_detected=item.class_detected,
            )
            for item in compliance.epp_items
        ],
        detected=compliance.detected,
        missing=compliance.missing,
        person_count=compliance.person_count,
        total_detections=compliance.total_detections,
    )
