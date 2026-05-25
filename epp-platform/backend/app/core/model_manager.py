"""
model_manager.py — Gestión del ciclo de vida del modelo YOLOv8.

Implementa el patrón Singleton para garantizar que el modelo se cargue
UNA SOLA VEZ al arrancar el servidor y se reutilice en cada request.

FIX Render: la carga se hace en un thread background para que uvicorn
abra el puerto inmediatamente y no haga timeout en el port scan.
"""

import logging
import threading
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
        self._load_error: str | None = None
        self._initialized = True

    def _load_in_background(self) -> None:
        """Carga el modelo en un thread separado para no bloquear el startup."""
        try:
            logger.info(f"[background] Cargando modelo YOLO desde: {MODEL_PATH}")
            t0 = time.perf_counter()

            self._model = YOLO(str(MODEL_PATH))

            # Warm-up: una inferencia dummy para que torch compile sus kernels
            import numpy as np
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            self._model(dummy, verbose=False)

            self._load_time_ms = (time.perf_counter() - t0) * 1000
            self._is_ready = True

            class_count = len(self._model.names)
            logger.info(
                f"[background] ✅ Modelo listo en {self._load_time_ms:.0f}ms | "
                f"{class_count} clases | "
                f"confianza={MODEL_CONFIDENCE} | iou={MODEL_IOU}"
            )
        except Exception as e:
            self._load_error = str(e)
            logger.critical(f"[background] ❌ Error cargando modelo: {e}")

    def load(self) -> None:
        """
        Inicia la carga del modelo en un thread background.
        Retorna inmediatamente para que uvicorn pueda abrir el puerto.
        """
        if self._is_ready:
            logger.info("Modelo ya cargado, ignorando llamada duplicada.")
            return

        thread = threading.Thread(target=self._load_in_background, daemon=True)
        thread.start()
        logger.info("✅ Servidor listo — modelo cargando en background...")

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
        Acceso al modelo. Lanza RuntimeError si no está listo aún.
        """
        if not self._is_ready or self._model is None:
            if self._load_error:
                raise RuntimeError(f"Error al cargar el modelo: {self._load_error}")
            raise RuntimeError(
                "El modelo aún se está cargando. "
                "Espera unos segundos y vuelve a intentarlo."
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
            "load_error": self._load_error,
            "class_count": len(self._model.names) if self._is_ready else 0,
            "classes": list(self._model.names.values()) if self._is_ready else [],
        }


# Instancia global — importar esto en cualquier módulo que necesite el modelo
model_manager = ModelManager()