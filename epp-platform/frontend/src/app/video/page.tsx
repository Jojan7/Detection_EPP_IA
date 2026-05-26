"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Video, Zap, Download, RotateCcw,
  Clock, Film, Gauge, ChevronDown, ChevronUp, Loader2
} from "lucide-react"
import { api } from "@/lib/api"
import type { VideoDetectionResult, JobStatus } from "@/types/epp"
import { UploadZone }      from "@/components/ui/UploadZone"
import { ComplianceCard }  from "@/components/ui/ComplianceCard"
import { ProcessingState } from "@/components/ui/ProcessingState"
import { formatDuration }  from "@/lib/utils"

const PROGRESS_MESSAGES = [
  "Analizando frames...",
  "Ejecutando inferencia YOLOv8...",
  "Detectando elementos EPP...",
  "Verificando cumplimiento normativa...",
  "Generando video anotado...",
  "Convirtiendo a H.264...",
]

export default function VideoPage() {
  const [file,          setFile]          = useState<File | null>(null)
  const [status,        setStatus]        = useState<JobStatus>("idle")
  const [result,        setResult]        = useState<VideoDetectionResult | null>(null)
  const [error,         setError]         = useState<string | null>(null)
  const [progress,      setProgress]      = useState(0)
  const [msgIndex,      setMsgIndex]      = useState(0)
  const [frameSkip,     setFrameSkip]     = useState(4)   // FIX: default 4 para reducir tiempo
  const [showConfig,    setShowConfig]    = useState(false)
  const [modelReady,    setModelReady]    = useState(false)
  const [modelChecking, setModelChecking] = useState(true)
  const msgInterval    = useRef<NodeJS.Timeout | null>(null)
  const healthInterval = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const h = await api.health()
        if (h.model_ready) {
          setModelReady(true)
          setModelChecking(false)
          if (healthInterval.current) clearInterval(healthInterval.current)
        }
      } catch {
        // backend aún no responde, seguir intentando
      }
    }

    checkHealth()
    healthInterval.current = setInterval(checkHealth, 5000)

    return () => {
      if (healthInterval.current) clearInterval(healthInterval.current)
    }
  }, [])

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setResult(null)
    setError(null)
    setStatus("idle")
  }, [])

  const startProgressMessages = () => {
    let i = 0
    msgInterval.current = setInterval(() => {
      i = (i + 1) % PROGRESS_MESSAGES.length
      setMsgIndex(i)
    }, 3500)
  }

  const stopProgressMessages = () => {
    if (msgInterval.current) clearInterval(msgInterval.current)
  }

  const handleDetect = async () => {
    if (!file) return
    setStatus("processing")
    setError(null)
    setProgress(0)
    setMsgIndex(0)
    startProgressMessages()

    try {
      const res = await api.detectVideo(file, frameSkip, (pct) => {
        setProgress(pct)
      })
      stopProgressMessages()
      setResult(res)
      setStatus("done")
    } catch (e: any) {
      stopProgressMessages()
      setError(e.message)
      setStatus("error")
    }
  }

  const handleReset = () => {
    stopProgressMessages()
    setFile(null)
    setResult(null)
    setError(null)
    setStatus("idle")
    setProgress(0)
    setMsgIndex(0)
  }

  const isProcessing = status === "processing"

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-3">
          <Video className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs text-text-muted tracking-widest uppercase">
            Detección en Video
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold text-text-primary">
          Análisis EPP — Video
        </h1>
        <p className="font-body text-sm text-text-secondary mt-1">
          Procesa un video completo. Cada frame es analizado y el video anotado queda disponible para descarga.
        </p>
      </motion.div>

      {/* Banner: modelo cargando */}
      <AnimatePresence>
        {modelChecking && !modelReady && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-6 glass rounded-sm px-4 py-3 flex items-center gap-3 border border-warn/30"
          >
            <Loader2 className="w-4 h-4 text-warn animate-spin flex-shrink-0" />
            <p className="font-mono text-xs text-warn">
              El modelo de IA está cargando en el servidor — esto toma ~60-90 segundos la primera vez.
              El botón se habilitará automáticamente cuando esté listo.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Banner: limitación plan gratuito */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-6 glass rounded-sm px-4 py-3 flex items-center gap-3 border border-border/40"
      >
        <Clock className="w-4 h-4 text-text-muted flex-shrink-0" />
        <p className="font-mono text-xs text-text-muted">
          Plan gratuito: videos cortos recomendados (&lt;30 segundos). Usa frame skip 4-5 para videos más largos.
        </p>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Columna izquierda */}
        <div className="space-y-4">

          {/* Upload */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <UploadZone
              accept="video"
              onFile={handleFile}
              disabled={isProcessing}
              className="min-h-[220px]"
            />
          </motion.div>

          {/* Config colapsable */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="glass rounded-sm overflow-hidden"
          >
            <button
              onClick={() => setShowConfig(!showConfig)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-text-muted" />
                <span className="font-display text-sm text-text-secondary">
                  Configuración de procesamiento
                </span>
              </div>
              {showConfig
                ? <ChevronUp   className="w-4 h-4 text-text-muted" />
                : <ChevronDown className="w-4 h-4 text-text-muted" />
              }
            </button>

            <AnimatePresence>
              {showConfig && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 pt-1 border-t border-border/40 space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="font-display text-sm text-text-secondary">
                          Frame skip
                        </label>
                        <span className="font-mono text-sm text-neon">1 de cada {frameSkip}</span>
                      </div>
                      <input
                        type="range"
                        min={1} max={5}
                        value={frameSkip}
                        disabled={isProcessing}
                        onChange={(e) => setFrameSkip(Number(e.target.value))}
                        className="w-full accent-[#00ff88] cursor-pointer disabled:opacity-50"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="font-mono text-xs text-text-muted">Máxima precisión</span>
                        <span className="font-mono text-xs text-text-muted">Máxima velocidad</span>
                      </div>
                    </div>

                    <div className="bg-panel rounded-sm px-3 py-2 flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-warn flex-shrink-0" />
                      <p className="font-mono text-xs text-text-secondary">
                        En plan gratuito usa frame skip 4-5 y videos cortos (&lt;30s).
                        Frame skip 4 es el mejor balance para CPU limitado.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Estado / Acción */}
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <motion.div
                key="proc"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass rounded-sm"
              >
                <ProcessingState
                  label={PROGRESS_MESSAGES[msgIndex]}
                  progress={progress > 0 ? Math.min(progress, 95) : undefined}
                />
                <p className="font-mono text-xs text-text-muted text-center pb-6">
                  No cierres esta ventana — el procesamiento continúa en el servidor.
                </p>
              </motion.div>

            ) : status === "error" ? (
              <motion.div
                key="err"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-danger rounded-sm p-4"
              >
                <p className="font-mono text-sm text-danger">⚠ {error}</p>
                <button onClick={handleReset} className="btn-outline mt-3 text-xs">
                  Intentar de nuevo
                </button>
              </motion.div>

            ) : (
              <motion.div
                key="btns"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex gap-3"
              >
                <button
                  onClick={handleDetect}
                  disabled={!file || !modelReady || isProcessing}
                  className="btn-primary flex items-center gap-2 flex-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {!modelReady
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Cargando modelo...</>
                    : <><Zap className="w-4 h-4" /> Procesar Video</>
                  }
                </button>

                {status === "done" && (
                  <button onClick={handleReset} className="btn-outline flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Columna derecha — Resultado */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {status === "done" && result ? (
              <motion.div
                key="res"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <div className="glass rounded-sm p-5 grid grid-cols-2 gap-x-6 gap-y-4">
                  <div className="col-span-2 flex items-center gap-2 mb-1">
                    <Film className="w-4 h-4 text-neon" />
                    <span className="font-display font-semibold text-sm text-text-primary">
                      Resumen del procesamiento
                    </span>
                  </div>

                  {[
                    { label: "Duración",          value: formatDuration(result.video_duration)  },
                    { label: "Resolución",         value: `${result.video_width}×${result.video_height}` },
                    { label: "FPS",                value: `${result.video_fps.toFixed(0)} fps`  },
                    { label: "Frames analizados",  value: result.frames_processed               },
                    { label: "Tiempo proceso",     value: `${result.processing_time_sec}s`      },
                    { label: "Tamaño output",      value: `${(result.output_size_kb / 1024).toFixed(1)} MB` },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="data-label">{label}</p>
                      <p className="font-mono text-sm text-text-primary mt-0.5">{value}</p>
                    </div>
                  ))}

                  <div className="col-span-2 pt-2 border-t border-border/40">
                    <a
                      href={api.getDownloadUrl(result.job_id)}
                      download={`epp_resultado_${result.job_id}.mp4`}
                      className="btn-primary flex items-center gap-2 justify-center w-full"
                    >
                      <Download className="w-4 h-4" />
                      Descargar Video Procesado
                    </a>
                    <p className="font-mono text-xs text-text-muted text-center mt-2">
                      El archivo se elimina del servidor tras la descarga
                    </p>
                  </div>
                </div>

                <ComplianceCard compliance={result.compliance} />
              </motion.div>

            ) : (
              <motion.div
                key="ph"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass rounded-sm flex flex-col items-center justify-center min-h-[420px] border border-dashed border-border"
              >
                <div className="p-4 rounded-sm bg-panel border border-border mb-4">
                  <Video className="w-8 h-8 text-text-muted" />
                </div>
                <p className="font-display text-sm text-text-secondary">
                  El resultado aparecerá aquí
                </p>
                <p className="font-mono text-xs text-text-muted mt-1">
                  Sube un video corto (&lt;30s) y presiona Procesar
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
