"""
compliance.py — Lógica de cumplimiento EPP.

Módulo de negocio puro: recibe clases detectadas por YOLO y determina
el estado de cumplimiento de cada EPP requerido.

Separado del detector intencionalmente:
- Las reglas de negocio cambian independientemente del modelo.
- Es testeable sin cargar YOLO.
- En el futuro puede parametrizarse por zona, empresa o turno.
"""

from dataclasses import dataclass, field
from typing import Final

from app.core.config import EPP_REQUIRED

# ── Estados posibles ───────────────────────────────────────────────────────────
STATUS_COMPLIANT: Final[str] = "COMPLIANT"   # ✅ todos los EPP presentes
STATUS_VIOLATION: Final[str] = "VIOLATION"   # ❌ uno o más EPP faltantes
STATUS_NO_PERSON: Final[str] = "NO_PERSON"   # sin persona en la imagen/frame

# Umbral de presencia para video: EPP debe aparecer en ≥40% de frames
# con persona para considerarse "portado". Más conservador que 30% para
# entornos industriales donde la seguridad es crítica.
VIDEO_PRESENCE_THRESHOLD: Final[float] = 0.40


@dataclass
class EPPItemStatus:
    """Estado individual de un elemento EPP para mostrar en la UI."""
    key:            str    # clave interna: "helmet", "vest"...
    label:          str    # display español: "Casco", "Chaleco"...
    icon:           str    # emoji: "⛑️", "🦺"...
    present:        bool   # ¿fue detectado y cumple?
    class_detected: str    # clase YOLO que activó el resultado (o "")
    confidence:     float = 0.0


@dataclass
class ComplianceResult:
    """
    Resultado completo de cumplimiento EPP para una imagen o frame de video.
    Serializable directamente a JSON vía Pydantic.
    """
    status:         str    # COMPLIANT / VIOLATION / NO_PERSON
    compliant:      bool
    compliance_pct: int    # 0–100, para barra de progreso en UI

    epp_items:   list[EPPItemStatus] = field(default_factory=list)
    detected:    list[str] = field(default_factory=list)   # labels presentes
    missing:     list[str] = field(default_factory=list)   # labels faltantes

    person_count:     int   = 0
    total_detections: int   = 0
    compliance_rate:  float = 0.0   # fracción 0.0–1.0


def evaluate_compliance(
    detected_classes: set[str],
    person_count:     int = 1,
    total_detections: int = 0,
) -> ComplianceResult:
    """
    Evalúa cumplimiento EPP dados las clases detectadas en un frame/imagen.

    Lógica de prioridad para cada EPP:
      1. cls_absent detectada  → NO cumple (modelo vio explícitamente la falta)
      2. cls_present detectada → SÍ cumple
      3. ninguna detectada     → NO cumple (EPP fuera de campo o no visible)

    Args:
        detected_classes:  set de strings con nombres de clases YOLO detectadas
        person_count:      número de personas en el frame
        total_detections:  total de bounding boxes (para metadata)
    """
    if person_count == 0:
        return ComplianceResult(
            status=STATUS_NO_PERSON,
            compliant=False,
            compliance_pct=0,
            compliance_rate=0.0,
            person_count=0,
            total_detections=total_detections,
        )

    epp_items:       list[EPPItemStatus] = []
    detected_labels: list[str]          = []
    missing_labels:  list[str]          = []

    for key, cfg in EPP_REQUIRED.items():
        cls_present: str       = cfg["cls_present"]
        cls_absent:  str | None = cfg["cls_absent"]
        label:       str       = cfg["label"]
        icon:        str       = cfg["icon"]

        has_present = cls_present in detected_classes
        has_absent  = (cls_absent in detected_classes) if cls_absent else False

        if has_absent:
            # Modelo detectó explícitamente la AUSENCIA del EPP — máxima certeza
            item = EPPItemStatus(
                key=key, label=label, icon=icon,
                present=False, class_detected=cls_absent,
            )
            missing_labels.append(label)

        elif has_present:
            # EPP visible y confirmado
            item = EPPItemStatus(
                key=key, label=label, icon=icon,
                present=True, class_detected=cls_present,
            )
            detected_labels.append(label)

        else:
            # No detectado de ninguna forma → se asume faltante
            item = EPPItemStatus(
                key=key, label=label, icon=icon,
                present=False, class_detected="",
            )
            missing_labels.append(label)

        epp_items.append(item)

    total_epp      = len(EPP_REQUIRED)
    present_count  = len(detected_labels)
    compliance_rate = present_count / total_epp if total_epp else 0.0
    compliant       = len(missing_labels) == 0

    return ComplianceResult(
        status=STATUS_COMPLIANT if compliant else STATUS_VIOLATION,
        compliant=compliant,
        compliance_rate=round(compliance_rate, 4),
        compliance_pct=round(compliance_rate * 100),
        epp_items=epp_items,
        detected=detected_labels,
        missing=missing_labels,
        person_count=person_count,
        total_detections=total_detections,
    )


def aggregate_video_compliance(
    frame_results: list[ComplianceResult],
) -> ComplianceResult:
    """
    Consolida resultados frame-a-frame de un video en un único resultado.

    Estrategia de presencia (threshold 40%):
      - Un EPP se considera "portado en el video" si apareció en ≥40%
        de los frames donde se detectó al menos una persona.
      - Esto es conservador pero justo: tolera oclusiones momentáneas
        (persona girando, objeto pasando) sin ignorar EPP que falta
        de verdad durante la mayor parte del tiempo.

    Args:
        frame_results: lista de ComplianceResult, uno por frame procesado
    """
    frames_with_person = [r for r in frame_results if r.person_count > 0]

    if not frames_with_person:
        return ComplianceResult(
            status=STATUS_NO_PERSON,
            compliant=False,
            compliance_pct=0,
            compliance_rate=0.0,
        )

    total_frames = len(frames_with_person)

    # Contar frames en que cada EPP estuvo presente
    presence_counts: dict[str, int] = {key: 0 for key in EPP_REQUIRED}
    for result in frames_with_person:
        for item in result.epp_items:
            if item.present:
                presence_counts[item.key] += 1

    # Construir set de clases "efectivamente presentes" según threshold
    effective_classes: set[str] = set()
    for key, count in presence_counts.items():
        ratio = count / total_frames
        if ratio >= VIDEO_PRESENCE_THRESHOLD:
            effective_classes.add(EPP_REQUIRED[key]["cls_present"])

    # Evaluar cumplimiento con las clases efectivas
    result = evaluate_compliance(
        detected_classes=effective_classes,
        person_count=1,
        total_detections=total_frames,
    )
    # Sobreescribir person_count con frames analizados (más útil en video)
    result.person_count = total_frames
    return result
