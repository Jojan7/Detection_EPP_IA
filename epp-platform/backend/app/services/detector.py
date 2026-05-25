"""
detector.py — Servicio de detección EPP.

Une el modelo YOLO con la lógica de compliance y produce resultados
estructurados para imágenes y frames de video.

Responsabilidades:
- Recibir imagen (numpy array o bytes) y devolver DetectionResult
- Extraer clases y confianzas de los resultados YOLO
- Delegar la evaluación de cumplimiento a compliance.py
- Dibujar bounding boxes profesionales sobre el frame

NO maneja archivos, rutas, HTTP ni video. Solo inferencia + compliance.
"""

import logging
import time
from dataclasses import dataclass, field

import cv2
import numpy as np

from app.core.config import EPP_COLORS, EPP_REQUIRED, MODEL_CONFIDENCE
from app.core.model_manager import model_manager
from app.services.compliance import (
    ComplianceResult,
    EPPItemStatus,
    evaluate_compliance,
)

logger = logging.getLogger(__name__)


@dataclass
class BoundingBox:
    """Bounding box individual de una detección."""
    x1:         int
    y1:         int
    x2:         int
    y2:         int
    class_name: str
    confidence: float
    class_id:   int


@dataclass
class DetectionResult:
    """Resultado completo de detección para una imagen o frame."""
    boxes:          list[BoundingBox]
    compliance:     ComplianceResult
    annotated_frame: np.ndarray         # frame con bounding boxes dibujados
    inference_ms:   float               # tiempo de inferencia en ms
    frame_index:    int = 0             # útil para video


# ── Paleta de colores para bounding boxes ─────────────────────────────────────
# Verde para EPP presente, rojo para ausente, gris para persona
_COLOR_PRESENT  = (34, 197, 94)    # verde vibrante
_COLOR_ABSENT   = (239, 68, 68)    # rojo
_COLOR_PERSON   = (148, 163, 184)  # gris pizarra
_COLOR_NONE     = (100, 116, 139)  # gris oscuro
_COLOR_DEFAULT  = (255, 255, 255)

# Tipografía
_FONT            = cv2.FONT_HERSHEY_SIMPLEX
_FONT_SCALE_BOX  = 0.55
_FONT_SCALE_HUD  = 0.5
_FONT_THICKNESS  = 1
_BOX_THICKNESS   = 2


def _get_box_color(class_name: str) -> tuple[int, int, int]:
    """Determina el color del bounding box según la clase."""
    if class_name == "Person":
        return _COLOR_PERSON
    if class_name == "none":
        return _COLOR_NONE
    # Clases negativas (no_helmet, no_gloves...) → rojo
    if class_name.startswith("no_"):
        return _COLOR_ABSENT
    # EPP positivo → verde
    return _COLOR_PRESENT


def _draw_box(
    frame:      np.ndarray,
    box:        BoundingBox,
    thickness:  int = _BOX_THICKNESS,
) -> None:
    """
    Dibuja un bounding box con etiqueta sobre el frame.
    Estilo: rectángulo con esquinas redondeadas simuladas + label con fondo.
    """
    color   = _get_box_color(box.class_name)
    x1, y1, x2, y2 = box.x1, box.y1, box.x2, box.y2

    # Rectángulo principal
    cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)

    # Esquinas decorativas (estilo moderno)
    corner_len = max(8, min(20, (x2 - x1) // 5))
    lw = thickness + 1
    # Superior izquierda
    cv2.line(frame, (x1, y1), (x1 + corner_len, y1), color, lw)
    cv2.line(frame, (x1, y1), (x1, y1 + corner_len), color, lw)
    # Superior derecha
    cv2.line(frame, (x2, y1), (x2 - corner_len, y1), color, lw)
    cv2.line(frame, (x2, y1), (x2, y1 + corner_len), color, lw)
    # Inferior izquierda
    cv2.line(frame, (x1, y2), (x1 + corner_len, y2), color, lw)
    cv2.line(frame, (x1, y2), (x1, y2 - corner_len), color, lw)
    # Inferior derecha
    cv2.line(frame, (x2, y2), (x2 - corner_len, y2), color, lw)
    cv2.line(frame, (x2, y2), (x2, y2 - corner_len), color, lw)

    # Etiqueta: "ClassName 0.87"
    label = f"{box.class_name} {box.confidence:.2f}"
    (tw, th), _ = cv2.getTextSize(label, _FONT, _FONT_SCALE_BOX, _FONT_THICKNESS)
    pad = 3

    # Fondo de etiqueta semitransparente
    label_y = y1 - th - pad * 2
    if label_y < 0:
        label_y = y2 + pad
    bg_y1 = label_y - pad
    bg_y2 = label_y + th + pad

    overlay = frame.copy()
    cv2.rectangle(overlay, (x1 - 1, bg_y1), (x1 + tw + pad * 2, bg_y2), color, -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)

    cv2.putText(
        frame, label,
        (x1 + pad, label_y + th),
        _FONT, _FONT_SCALE_BOX, (0, 0, 0), _FONT_THICKNESS, cv2.LINE_AA,
    )


def _draw_compliance_hud(
    frame:      np.ndarray,
    compliance: ComplianceResult,
) -> None:
    """
    Dibuja el HUD de cumplimiento EPP en la esquina superior derecha.
    Muestra: porcentaje, estado y lista de EPP con ✅/❌.
    """
    h, w = frame.shape[:2]

    # Panel de fondo
    panel_w  = 220
    panel_h  = 30 + len(compliance.epp_items) * 22 + 40
    margin   = 10
    px1      = w - panel_w - margin
    py1      = margin
    px2      = w - margin
    py2      = py1 + panel_h

    # Fondo semitransparente oscuro
    overlay = frame.copy()
    cv2.rectangle(overlay, (px1, py1), (px2, py2), (15, 15, 25), -1)
    cv2.addWeighted(overlay, 0.80, frame, 0.20, 0, frame)

    # Borde del panel (verde si cumple, rojo si no)
    border_color = _COLOR_PRESENT if compliance.compliant else _COLOR_ABSENT
    cv2.rectangle(frame, (px1, py1), (px2, py2), border_color, 1)

    # Título: porcentaje
    status_text  = f"EPP {compliance.compliance_pct}%"
    status_color = _COLOR_PRESENT if compliance.compliant else _COLOR_ABSENT
    cv2.putText(
        frame, status_text,
        (px1 + 8, py1 + 20),
        _FONT, 0.65, status_color, 2, cv2.LINE_AA,
    )

    # Lista de EPP
    y_offset = py1 + 40
    for item in compliance.epp_items:
        indicator = "OK" if item.present else "NO"
        color     = _COLOR_PRESENT if item.present else _COLOR_ABSENT
        text      = f"{indicator}  {item.label}"
        cv2.putText(
            frame, text,
            (px1 + 10, y_offset),
            _FONT, _FONT_SCALE_HUD, color, _FONT_THICKNESS, cv2.LINE_AA,
        )
        y_offset += 22

    # Línea de estado final
    status_label = "CUMPLE" if compliance.compliant else "NO CUMPLE"
    cv2.putText(
        frame, status_label,
        (px1 + 8, py2 - 8),
        _FONT, 0.55, border_color, 2, cv2.LINE_AA,
    )


def detect_frame(
    frame:      np.ndarray,
    confidence: float = MODEL_CONFIDENCE,
    draw:       bool  = True,
    frame_index: int  = 0,
) -> DetectionResult:
    """
    Ejecuta detección EPP sobre un frame (numpy array BGR).

    Args:
        frame:       imagen BGR como numpy array
        confidence:  umbral de confianza (por defecto el global)
        draw:        si True, dibuja boxes y HUD sobre el frame
        frame_index: índice del frame en un video (para metadata)

    Returns:
        DetectionResult con boxes, compliance y frame anotado
    """
    t0 = time.perf_counter()

    results = model_manager.predict(frame, confidence=confidence, verbose=False)
    inference_ms = (time.perf_counter() - t0) * 1000

    result      = results[0]
    names       = model_manager.class_names
    boxes: list[BoundingBox] = []

    # Clases detectadas en este frame (para compliance)
    detected_classes: set[str] = set()
    person_count  = 0

    for box_tensor in result.boxes:
        cls_id     = int(box_tensor.cls[0])
        conf       = float(box_tensor.conf[0])
        class_name = names[cls_id]
        xyxy       = box_tensor.xyxy[0].cpu().numpy().astype(int)

        bbox = BoundingBox(
            x1=int(xyxy[0]), y1=int(xyxy[1]),
            x2=int(xyxy[2]), y2=int(xyxy[3]),
            class_name=class_name,
            confidence=conf,
            class_id=cls_id,
        )
        boxes.append(bbox)
        detected_classes.add(class_name)

        if class_name == "Person":
            person_count += 1

    # Evaluar cumplimiento con las clases del frame
    compliance = evaluate_compliance(
        detected_classes=detected_classes,
        person_count=person_count,
        total_detections=len(boxes),
    )

    # Dibujar anotaciones sobre una copia del frame
    annotated = frame.copy()
    if draw:
        for bbox in boxes:
            _draw_box(annotated, bbox)
        if person_count > 0:
            _draw_compliance_hud(annotated, compliance)

    return DetectionResult(
        boxes=boxes,
        compliance=compliance,
        annotated_frame=annotated,
        inference_ms=round(inference_ms, 2),
        frame_index=frame_index,
    )


def detect_image_bytes(
    image_bytes: bytes,
    confidence:  float = MODEL_CONFIDENCE,
) -> DetectionResult:
    """
    Detecta EPP en una imagen dada como bytes (upload de usuario).

    Convierte bytes → numpy array BGR y delega a detect_frame.
    """
    arr   = np.frombuffer(image_bytes, np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)

    if frame is None:
        raise ValueError("No se pudo decodificar la imagen. Formato no soportado.")

    return detect_frame(frame, confidence=confidence)
