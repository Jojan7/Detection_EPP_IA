"""
config.py — Configuración centralizada del proyecto EPP AI.

Todas las variables de entorno y constantes del sistema viven aquí.
En producción (Render) se inyectan como env vars. En local se usa .env.
"""

import os
from pathlib import Path
from typing import Final

# ── Rutas base ────────────────────────────────────────────────────────────────
BASE_DIR: Final[Path] = Path(__file__).resolve().parent.parent.parent
MODELS_DIR: Final[Path] = BASE_DIR / "models"
TEMP_DIR: Final[Path] = BASE_DIR / "temp"

# ── Modelo YOLO ───────────────────────────────────────────────────────────────
MODEL_PATH: Final[Path] = MODELS_DIR / os.getenv("MODEL_FILENAME", "best.pt")
MODEL_CONFIDENCE: Final[float] = float(os.getenv("MODEL_CONFIDENCE", "0.45"))
MODEL_IOU: Final[float] = float(os.getenv("MODEL_IOU", "0.45"))
MODEL_IMG_SIZE: Final[int] = int(os.getenv("MODEL_IMG_SIZE", "640"))

# ── Clases del modelo ─────────────────────────────────────────────────────────
# Exactamente las 11 clases del dataset Roboflow entrenado
MODEL_CLASSES: Final[dict[int, str]] = {
    0:  "Person",
    1:  "boots",
    2:  "gloves",
    3:  "goggles",
    4:  "helmet",
    5:  "no_boots",
    6:  "no_gloves",
    7:  "no_goggle",
    8:  "no_helmet",
    9:  "none",
    10: "vest",
}

# ── EPP requeridos (los 5 obligatorios) ──────────────────────────────────────
# Clave      : identificador interno (inglés, consistente con YOLO)
# cls_present: clase YOLO que indica presencia del EPP
# cls_absent : clase YOLO que indica ausencia explícita (None = no existe en modelo)
# label      : nombre de display en español para la UI
# icon       : emoji para la UI
EPP_REQUIRED: Final[dict[str, dict]] = {
    "helmet": {
        "cls_present": "helmet",
        "cls_absent":  "no_helmet",
        "label":       "Casco",
        "icon":        "⛑️",
    },
    "vest": {
        "cls_present": "vest",
        "cls_absent":  None,          # modelo no tiene "no_vest"
        "label":       "Chaleco",
        "icon":        "🦺",
    },
    "goggles": {
        "cls_present": "goggles",
        "cls_absent":  "no_goggle",
        "label":       "Gafas",
        "icon":        "🥽",
    },
    "gloves": {
        "cls_present": "gloves",
        "cls_absent":  "no_gloves",
        "label":       "Guantes",
        "icon":        "🧤",
    },
    "boots": {
        "cls_present": "boots",
        "cls_absent":  "no_boots",
        "label":       "Botas",
        "icon":        "👢",
    },
}

# Colores por EPP para bounding boxes (BGR para OpenCV)
EPP_COLORS: Final[dict[str, tuple[int, int, int]]] = {
    "helmet":    (0, 255, 0),     # verde
    "vest":      (0, 200, 255),   # amarillo
    "goggles":   (255, 100, 0),   # azul
    "gloves":    (200, 0, 255),   # magenta
    "boots":     (0, 165, 255),   # naranja
    "no_helmet": (0, 0, 255),     # rojo
    "no_goggle": (0, 0, 255),
    "no_gloves": (0, 0, 255),
    "no_boots":  (0, 0, 255),
    "Person":    (180, 180, 180), # gris
    "none":      (100, 100, 100),
}

# ── Servidor ──────────────────────────────────────────────────────────────────
API_HOST: Final[str] = os.getenv("API_HOST", "0.0.0.0")
API_PORT: Final[int] = int(os.getenv("PORT", "8000"))  # Render usa $PORT
API_RELOAD: Final[bool] = os.getenv("ENVIRONMENT", "development") == "development"
ENVIRONMENT: Final[str] = os.getenv("ENVIRONMENT", "development")

# ── CORS ──────────────────────────────────────────────────────────────────────
# En producción: dominio real de Vercel. En local: localhost.
ALLOWED_ORIGINS: Final[list[str]] = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:3001"
).split(",")

# ── Archivos ──────────────────────────────────────────────────────────────────
MAX_IMAGE_SIZE_MB: Final[int] = int(os.getenv("MAX_IMAGE_SIZE_MB", "10"))
MAX_VIDEO_SIZE_MB: Final[int] = int(os.getenv("MAX_VIDEO_SIZE_MB", "100"))
MAX_IMAGE_BYTES: Final[int] = MAX_IMAGE_SIZE_MB * 1024 * 1024
MAX_VIDEO_BYTES: Final[int] = MAX_VIDEO_SIZE_MB * 1024 * 1024

ALLOWED_IMAGE_TYPES: Final[set[str]] = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_VIDEO_TYPES: Final[set[str]] = {"video/mp4", "video/avi", "video/quicktime"}

# ── Video processing ──────────────────────────────────────────────────────────
# En Render (CPU) procesamos cada N frames para no saturar
VIDEO_FRAME_SKIP: Final[int] = int(os.getenv("VIDEO_FRAME_SKIP", "1"))
VIDEO_MAX_FRAMES: Final[int] = int(os.getenv("VIDEO_MAX_FRAMES", "1800"))  # ~60s a 30fps
TEMP_FILE_TTL_SECONDS: Final[int] = int(os.getenv("TEMP_FILE_TTL_SECONDS", "3600"))

# ── WebSocket ─────────────────────────────────────────────────────────────────
WS_MAX_FRAME_SIZE: Final[int] = int(os.getenv("WS_MAX_FRAME_SIZE", "1048576"))  # 1MB
WS_JPEG_QUALITY: Final[int] = int(os.getenv("WS_JPEG_QUALITY", "75"))


def validate_config() -> None:
    """
    Valida que la configuración crítica esté presente al arrancar.
    Lanza RuntimeError si algo falta — falla rápido en lugar de errores oscuros.
    """
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"Modelo no encontrado en: {MODEL_PATH}\n"
            f"Coloca best.pt en: {MODELS_DIR}"
        )
