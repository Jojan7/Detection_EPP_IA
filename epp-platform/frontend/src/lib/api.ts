// lib/api.ts — Cliente HTTP hacia el backend FastAPI

import axios from "axios"
import type { ImageDetectionResult, VideoDetectionResult } from "@/types/epp"

// FIX: leer la URL del backend desde variable de entorno (configurada en Render/Vercel)
// En local usa el fallback http://localhost:8000
const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

// Instancia base con timeout razonable para CPU (Render)
const http = axios.create({
  baseURL: API_URL,
  timeout: 300_000, // 5 min — videos pueden tardar en procesarse
})

// ── Interceptor de errores global ─────────────────────────────────────────────
http.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err.response?.data?.detail ||
      err.response?.data?.error ||
      err.message ||
      "Error desconocido"
    return Promise.reject(new Error(msg))
  }
)

// ── Métodos de la API ─────────────────────────────────────────────────────────

export const api = {
  /**
   * Detecta EPP en una imagen.
   * @param file - File object del input
   * @param onProgress - callback 0-100 para barra de progreso
   */
  async detectImage(
    file:        File,
    onProgress?: (pct: number) => void
  ): Promise<ImageDetectionResult> {
    const form = new FormData()
    form.append("file", file)

    const { data } = await http.post<ImageDetectionResult>("/detect/image", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
    return data
  },

  /**
   * Detecta EPP en un video. Puede tardar minutos.
   * @param file      - File object del video
   * @param frameSkip - procesar 1 de cada N frames (default 2 para CPU)
   */
  async detectVideo(
    file:        File,
    frameSkip:   number = 2,
    onProgress?: (pct: number) => void
  ): Promise<VideoDetectionResult> {
    const form = new FormData()
    form.append("file", file)

    const { data } = await http.post<VideoDetectionResult>(
      `/detect/video?frame_skip=${frameSkip}`,
      form,
      {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (onProgress && e.total) {
            onProgress(Math.round((e.loaded / e.total) * 30))
          }
        },
      }
    )
    return data
  },

  /**
   * URL de descarga del video procesado.
   * FIX: URL absoluta con el dominio del backend para que funcione desde el frontend en producción
   */
  getDownloadUrl(jobId: string): string {
    return `${API_URL}/detect/video/${jobId}/download`
  },

  /** Verifica que el backend y el modelo estén listos. */
  async health(): Promise<{ status: string; model_ready: boolean }> {
    const { data } = await http.get("/health")
    return data
  },
}

// ── WebSocket helper ──────────────────────────────────────────────────────────

// FIX: construir WS_URL a partir de NEXT_PUBLIC_API_URL si no se define explícitamente
// Convierte https://... → wss://... y http://... → ws://...
function buildWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL
  }
  // Derivar del API_URL automáticamente
  return API_URL.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://")
}

export const WS_URL = buildWsUrl()

export function createStreamSocket(): WebSocket {
  return new WebSocket(`${WS_URL}/ws/stream`)
}

