"""
schemas.py — Modelos Pydantic para la API EPP.

Define los contratos de entrada/salida de todos los endpoints.
Pydantic garantiza validación automática, serialización JSON y
documentación automática en /docs (Swagger UI).

Principio: los schemas son DISTINTOS a los dataclasses de servicios.
Los servicios usan dataclasses ligeros internamente; los schemas son
la interfaz pública de la API con validación estricta.
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, computed_field


# ── Enums ─────────────────────────────────────────────────────────────────────

class ComplianceStatus(str, Enum):
    COMPLIANT = "COMPLIANT"
    VIOLATION = "VIOLATION"
    NO_PERSON = "NO_PERSON"


class ProcessingStatus(str, Enum):
    PENDING    = "pending"
    PROCESSING = "processing"
    DONE       = "done"
    ERROR      = "error"


# ── Sub-schemas ───────────────────────────────────────────────────────────────

class EPPItemSchema(BaseModel):
    """Estado de un elemento EPP individual."""
    key:            str   = Field(..., examples=["helmet"])
    label:          str   = Field(..., examples=["Casco"])
    icon:           str   = Field(..., examples=["⛑️"])
    present:        bool
    class_detected: str   = Field(..., examples=["helmet"])

    model_config = {"from_attributes": True}


class BoundingBoxSchema(BaseModel):
    """Bounding box de una detección individual."""
    x1:         int
    y1:         int
    x2:         int
    y2:         int
    class_name: str   = Field(..., examples=["helmet"])
    confidence: float = Field(..., ge=0.0, le=1.0)
    class_id:   int

    model_config = {"from_attributes": True}


class ComplianceSchema(BaseModel):
    """Resultado de cumplimiento EPP serializable."""
    status:          ComplianceStatus
    compliant:       bool
    compliance_pct:  int   = Field(..., ge=0, le=100)
    compliance_rate: float = Field(..., ge=0.0, le=1.0)

    epp_items: list[EPPItemSchema]
    detected:  list[str] = Field(default_factory=list)
    missing:   list[str] = Field(default_factory=list)

    person_count:     int
    total_detections: int

    @computed_field
    @property
    def access_allowed(self) -> bool:
        """True si el trabajador puede ingresar a zona de trabajo."""
        return self.compliant

    @computed_field
    @property
    def summary(self) -> str:
        """Resumen legible para humanos."""
        if self.status == ComplianceStatus.NO_PERSON:
            return "No se detectó ninguna persona en la imagen."
        if self.compliant:
            return f"✅ Cumple normativa EPP. Porta: {', '.join(self.detected)}."
        missing_str = ", ".join(self.missing)
        detected_str = ", ".join(self.detected) if self.detected else "ninguno"
        return (
            f"❌ No cumple normativa EPP. "
            f"Porta: {detected_str}. "
            f"Falta: {missing_str}."
        )

    model_config = {"from_attributes": True}


# ── Response schemas ──────────────────────────────────────────────────────────

class ImageDetectionResponse(BaseModel):
    """Respuesta del endpoint POST /detect/image."""
    job_id:        str
    compliance:    ComplianceSchema
    boxes:         list[BoundingBoxSchema]
    inference_ms:  float
    image_b64:     str   = Field(..., description="Frame anotado en base64 JPEG")


class VideoDetectionResponse(BaseModel):
    """Respuesta del endpoint POST /detect/video."""
    job_id:              str
    status:              ProcessingStatus
    compliance:          ComplianceSchema
    frames_processed:    int
    frames_skipped:      int
    processing_time_sec: float
    output_size_kb:      float
    download_url:        str   = Field(..., description="URL para descargar el video procesado")

    # Metadata del video original
    video_width:    int
    video_height:   int
    video_fps:      float
    video_duration: float


class StreamFrameResponse(BaseModel):
    """Mensaje enviado por WebSocket por cada frame de webcam."""
    frame_index: int
    compliance:  ComplianceSchema
    inference_ms: float
    # El frame anotado se envía como bytes raw fuera de este schema


# ── Health / Info schemas ─────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status:        str  = "ok"
    model_ready:   bool
    load_time_ms:  float
    class_count:   int
    environment:   str


class ModelInfoResponse(BaseModel):
    model_path:   str
    class_count:  int
    classes:      list[str]
    epp_required: list[dict[str, Any]]
    confidence:   float
    iou:          float


# ── Error schema ──────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error:   str
    detail:  str  = ""
    code:    int  = 400
