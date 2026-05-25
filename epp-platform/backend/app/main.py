"""
main.py — Entry point de la aplicación FastAPI EPP AI.
"""

import logging
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import images, stream, videos
from app.api.schemas import ErrorResponse, HealthResponse, ModelInfoResponse
from app.core.config import (
    ALLOWED_ORIGINS,
    ENVIRONMENT,
    EPP_REQUIRED,
    MODEL_CONFIDENCE,
    MODEL_IOU,
    validate_config,
)
from app.core.model_manager import model_manager

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# ── Aplicación ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="EPP AI Detection API",
    description=(
        "API profesional de detección de Equipos de Protección Personal (EPP) "
        "usando YOLOv8. Detecta casco, chaleco, gafas, guantes y botas "
        "en imágenes, videos y webcam en tiempo real."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_tags=[
        {"name": "Detection",  "description": "Detección EPP en imágenes y videos"},
        {"name": "Stream",     "description": "Streaming en tiempo real via WebSocket"},
        {"name": "System",     "description": "Health check e información del sistema"},
    ],
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Lifecycle ─────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    """
    FIX Render: validate_config() y model_manager.load() arrancan el modelo
    en background. El puerto queda abierto de inmediato para que Render
    no haga timeout en el port scan.
    """
    logger.info(f"Iniciando EPP AI API | Entorno: {ENVIRONMENT}")
    try:
        validate_config()
        # load() ahora es no-bloqueante — lanza un thread y retorna al instante
        model_manager.load()
        logger.info("✅ API lista para recibir requests (modelo cargando en background)")
    except Exception as e:
        logger.critical(f"❌ Fallo en startup: {e}")
        sys.exit(1)


@app.on_event("shutdown")
async def shutdown():
    logger.info("Apagando servidor...")
    model_manager.unload()


# ── Manejo global de errores ──────────────────────────────────────────────────

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(
        status_code=400,
        content=ErrorResponse(error="Bad Request", detail=str(exc), code=400).model_dump(),
    )


@app.exception_handler(RuntimeError)
async def runtime_error_handler(request: Request, exc: RuntimeError):
    logger.error(f"RuntimeError: {exc}")
    return JSONResponse(
        status_code=500,
        content=ErrorResponse(error="Internal Server Error", detail=str(exc), code=500).model_dump(),
    )


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(images.router)
app.include_router(videos.router)
app.include_router(stream.router)


# ── Endpoints del sistema ─────────────────────────────────────────────────────

@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["System"],
    summary="Health check",
    description="Verifica que el servidor y el modelo estén operativos.",
)
async def health():
    info = model_manager.health()
    return HealthResponse(
        status="ok" if info["model_ready"] else "loading",
        model_ready=info["model_ready"],
        load_time_ms=info["load_time_ms"],
        class_count=info["class_count"],
        environment=ENVIRONMENT,
    )


@app.get(
    "/model/info",
    response_model=ModelInfoResponse,
    tags=["System"],
    summary="Información del modelo",
)
async def model_info():
    info = model_manager.health()
    return ModelInfoResponse(
        model_path=info["model_path"],
        class_count=info["class_count"],
        classes=info["classes"],
        epp_required=[
            {
                "key":   key,
                "label": cfg["label"],
                "icon":  cfg["icon"],
            }
            for key, cfg in EPP_REQUIRED.items()
        ],
        confidence=MODEL_CONFIDENCE,
        iou=MODEL_IOU,
    )


@app.get("/", tags=["System"])
async def root():
    return {
        "message": "EPP AI Detection API",
        "docs":    "/docs",
        "health":  "/health",
        "version": "1.0.0",
    }
