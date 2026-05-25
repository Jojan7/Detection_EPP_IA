# ── Imagen base ───────────────────────────────────────────────────────────────
FROM python:3.11-slim

# ── Variables de entorno ───────────────────────────────────────────────────────
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    ENVIRONMENT=production \
    PORT=8000

# ── Dependencias del sistema ───────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# ── Directorio de trabajo ──────────────────────────────────────────────────────
WORKDIR /app

# ── Instalar dependencias Python ───────────────────────────────────────────────
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Copiar código fuente ───────────────────────────────────────────────────────
COPY app/ ./app/
COPY models/ ./models/

# ── Crear directorios necesarios ───────────────────────────────────────────────
RUN mkdir -p temp

# ── Usuario no-root para seguridad ────────────────────────────────────────────
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# ── Expose y comando ───────────────────────────────────────────────────────────
# FIX: usar $PORT que Render inyecta dinámicamente (no hardcodear 8000)
EXPOSE $PORT
CMD sh -c "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"