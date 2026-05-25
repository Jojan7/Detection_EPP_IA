"""
stream.py — WebSocket para detección EPP en tiempo real (webcam).

Protocolo:
  Cliente → Servidor : bytes JPEG del frame capturado por la webcam
  Servidor → Cliente : JSON con compliance + frame anotado en base64

El frontend envía frames a ~10fps para no saturar CPU.
El servidor procesa cada frame y devuelve el resultado inmediatamente.

Diseño para Render (CPU):
- Sin estado entre frames (stateless)
- Manejo explícito de desconexiones
- Timeout por inactividad para liberar conexiones zombies
"""

import asyncio
import base64
import logging
from dataclasses import asdict

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.routes.images import _build_compliance_schema
from app.services.detector import detect_image_bytes

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Stream"])

# Tiempo máximo sin recibir frame antes de cerrar la conexión
WS_IDLE_TIMEOUT = 30.0  # segundos


@router.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """
    WebSocket de detección EPP en tiempo real.

    El cliente envía frames JPEG como bytes binarios.
    El servidor responde con JSON:
    {
      "frame_index": 42,
      "compliance": { ...ComplianceSchema... },
      "inference_ms": 85.2,
      "annotated_frame": "<base64 JPEG>"
    }
    """
    await websocket.accept()
    client_id   = id(websocket)
    frame_index = 0

    logger.info(f"[WS:{client_id}] Conexión establecida")

    try:
        while True:
            # Recibir frame con timeout de inactividad
            try:
                raw = await asyncio.wait_for(
                    websocket.receive_bytes(),
                    timeout=WS_IDLE_TIMEOUT,
                )
            except asyncio.TimeoutError:
                logger.warning(f"[WS:{client_id}] Timeout por inactividad, cerrando")
                await websocket.close(code=1001, reason="Idle timeout")
                break

            # Procesar en executor para no bloquear event loop
            loop   = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: detect_image_bytes(raw),
            )

            # Codificar frame anotado como base64 JPEG
            _, buf = cv2.imencode(
                ".jpg",
                result.annotated_frame,
                [cv2.IMWRITE_JPEG_QUALITY, 75],
            )
            frame_b64 = base64.b64encode(buf.tobytes()).decode("utf-8")

            # Serializar compliance
            compliance_schema = _build_compliance_schema(result.compliance)

            # Enviar respuesta JSON
            response = {
                "frame_index":     frame_index,
                "compliance":      compliance_schema.model_dump(),
                "inference_ms":    result.inference_ms,
                "annotated_frame": frame_b64,
            }

            await websocket.send_json(response)
            frame_index += 1

            if frame_index % 100 == 0:
                logger.debug(f"[WS:{client_id}] Frame {frame_index}")

    except WebSocketDisconnect:
        logger.info(f"[WS:{client_id}] Cliente desconectado tras {frame_index} frames")

    except Exception as e:
        logger.error(f"[WS:{client_id}] Error inesperado: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Internal server error")
        except Exception:
            pass
