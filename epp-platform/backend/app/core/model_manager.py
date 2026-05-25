"""
model_manager.py — Gestión del ciclo de vida del modelo YOLOv8.

Implementa el patrón Singleton para garantizar que el modelo se cargue
UNA SOLA VEZ al arrancar el servidor y se reutilice en cada request.

Crítico para Render: cargar YOLO en cada request consumiría ~300MB por
request y colapsaría el servidor en segundos.
"""

import logging
import time
from threading import Lock

from ultralytics import YOLO

from app.core.config import MODEL_CONFIDENCE, MODEL_IOU, MODEL_IMG_SIZE, MODEL_PATH

logger = logging.getLogger(__name__)


class ModelManager:
    """
    Singleton thread-safe para el modelo YOLOv8.

    Garantiza una única instancia del modelo en memoria, con métricas
    de carga y estado de salud para el health-check del servidor.
    """

    _instance: "ModelManager | None" = None
    _lock: Lock = Lock()

    def __new__(cls) -> "ModelManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._model: YOLO | None = None
        self._load_time_ms: float = 0.0
        self._is_ready: bool = False
        self._initialized = True

    def load(self) -> None:
        """
        Carga el modelo desde disco. Llamar una sola vez en el startup de FastAPI.
        Lanza RuntimeError si el archivo no existe o el modelo es inválido.
        """
        if self._is_ready:
            logger.info("Modelo ya cargado, ignorando llamada duplicada.")
            return

        logger.info(f"Cargando modelo YOLO desde: {MODEL_PATH}")
        t0 = time.perf_counter()

        self._model = YOLO(str(MODEL_PATH))

        # Warm-up: una inferencia dummy para que torch compile sus kernels
        # Evita que el PRIMER request real sea lento
        import numpy as np
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        self._model(dummy, verbose=False)

        self._load_time_ms = (time.perf_counter() - t0) * 1000
        self._is_ready = True

        class_count = len(self._model.names)
        logger.info(
            f"Modelo listo en {self._load_time_ms:.0f}ms | "
            f"{class_count} clases | "
            f"confianza={MODEL_CONFIDENCE} | iou={MODEL_IOU}"
        )

    def unload(self) -> None:
        """Libera el modelo de memoria. Llamar en el shutdown de FastAPI."""
        if self._model is not None:
            del self._model
            self._model = None
            self._is_ready = False
            logger.info("Modelo liberado de memoria.")

    @property
    def model(self) -> YOLO:
        """
        Acceso al modelo. Lanza RuntimeError si no está cargado.
        Usar siempre este property, nunca _model directamente.
        """
        if not self._is_ready or self._model is None:
            raise RuntimeError(
                "El modelo no está cargado. "
                "¿Se llamó ModelManager().load() en el startup?"
            )
        return self._model

    @property
    def is_ready(self) -> bool:
        return self._is_ready

    @property
    def load_time_ms(self) -> float:
        return self._load_time_ms

    @property
    def class_names(self) -> dict[int, str]:
        """Devuelve el diccionario id->nombre de clases del modelo."""
        return self.model.names

    def predict(
        self,
        source,
        confidence: float = MODEL_CONFIDENCE,
        iou: float = MODEL_IOU,
        imgsz: int = MODEL_IMG_SIZE,
        verbose: bool = False,
    ):
        """
        Wrapper de inferencia con parámetros por defecto del proyecto.
        Centraliza todos los calls a YOLO para facilitar logging y métricas.
        """
        return self.model(
            source,
            conf=confidence,
            iou=iou,
            imgsz=imgsz,
            verbose=verbose,
        )

    def health(self) -> dict:
        """Estado del modelo para el endpoint /health."""
        return {
            "model_ready": self._is_ready,
            "model_path": str(MODEL_PATH),
            "load_time_ms": round(self._load_time_ms, 1),
            "class_count": len(self._model.names) if self._is_ready else 0,
            "classes": list(self._model.names.values()) if self._is_ready else [],
        }


# Instancia global — importar esto en cualquier módulo que necesite el modelo
model_manager = ModelManager()
