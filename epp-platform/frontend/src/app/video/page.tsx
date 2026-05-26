"use client"

import { useState, useRef, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Video, Play, Square, Pause, RefreshCw,
  Activity, Loader2, RotateCcw
} from "lucide-react"
import { useVideoStream } from "@/hooks/useVideoStream"
import { api } from "@/lib/api"
import { ComplianceCard } from "@/components/ui/ComplianceCard"
import { cn } from "@/lib/utils"

const STATUS_LABELS: Record<string, string> = {
  idle:       "INACTIVO",
  processing: "PROCESANDO",
  paused:     "PAUSADO",
  done:       "COMPLETADO",
  error:      "ERROR",
}

const STATUS_COLORS: Record<string, string> = {
  idle:       "text-text-muted",
  processing: "text-neon",
  paused:     "text-warn",
  done:       "text-neon",
  error:      "text-danger",
}

export default function VideoPage() {
  const [file,          setFile]          = useState<File | null>(null)
  const [modelReady,    setModelReady]    = useState(false)
  const [modelChecking, setModelChecking] = useState(true)
  const healthInterval = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)

  const {
    videoRef, canvasRef,
    status, latestFrame, progress, framesProcessed, fps, error,
    start, stop, pause, resume,
  } = useVideoStream()

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const h = await api.health()
        if (h.model_ready) {
          setModelReady(true)
          setModelChecking(false)
          if (healthInterval.current) clearInterval(healthInterval.current)
        }
      } catch { /* seguir intentando */ }
    }
    checkHealth()
    healthInterval.current = setInterval(checkHealth, 5000)
    return () => { if (healthInterval.current) clearInterval(healthInterval.current) }
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setFile(f)
  }

  const handleStart = async () => {
    if (!file) return
    await start(file)
  }

  const handleReset = () => {
    stop()
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const isActive     = status === "processing" || status === "paused"
  const isProcessing = status === "processing"
  const isDone       = status === "done"

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">

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
          Sube un video y analiza cada frame en tiempo real via WebSocket.
          Los resultados EPP se muestran mientras se reproduce.
        </p>
      </motion.div>

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
              El modelo de IA está cargando — el botón se habilitará automáticamente.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">

        <div className="space-y-4">

          <div className="glass rounded-sm overflow-hidden relative">

            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2
                            bg-gradient-to-b from-void/80 to-transparent pointer-events-none">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  isProcessing      ? "bg-neon animate-pulse" :
                  status === "paused" ? "bg-warn" :
                  isDone            ? "bg-neon" :
                  "bg-text-muted"
                )} />
                <span className={cn("font-mono text-xs", STATUS_COLORS[status])}>
                  {STATUS_LABELS[status]}
                </span>
              </div>

              {isActive && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-neon" />
                    <span className="font-mono text-xs text-neon">{fps} FPS</span>
                  </div>
                  <span className="font-mono text-xs text-text-muted">
                    {framesProcessed} frames
                  </span>
                </div>
              )}
            </div>

            {isActive && (
              <div className="absolute bottom-[61px] left-0 right-0 z-20 px-4">
                <div className="w-full bg-void/60 rounded-full h-1">
                  <div
                    className="bg-neon h-1 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="relative bg-void aspect-video">
              <video
                ref={videoRef}
                className={cn(
                  "w-full h-full object-contain",
                  !isActive && !isDone && "opacity-0"
                )}
                muted
                playsInline
              />

              <AnimatePresence>
                {(isActive || isDone) && latestFrame?.annotated_frame && (
                  <motion.img
                    key={latestFrame.frame_index}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.05 }}
                    src={`data:image/jpeg;base64,${latestFrame.annotated_frame}`}
                    alt="Frame anotado"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
              </AnimatePresence>

              {status === "idle" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="p-5 rounded-sm bg-panel border border-border">
                    <Video className="w-10 h-10 text-text-muted" />
                  </div>
                  <p className="font-display text-sm text-text-secondary">
                    {file ? file.name : "Selecciona un video para comenzar"}
                  </p>
                </div>
              )}

              {isDone && !latestFrame?.annotated_frame && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/60">
                  <p className="font-mono text-sm text-neon">✅ Procesamiento completado</p>
                  <p className="font-mono text-xs text-text-muted">{framesProcessed} frames analizados</p>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="flex items-center gap-3 p-4 border-t border-border">
              {status === "idle" ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="video-input"
                  />
                  <label
                    htmlFor="video-input"
                    className="btn-outline flex items-center gap-2 cursor-pointer px-4"
                  >
                    <Video className="w-4 h-4" />
                    {file ? "Cambiar" : "Seleccionar video"}
                  </label>
                  <button
                    onClick={handleStart}
                    disabled={!file || !modelReady}
                    className="btn-primary flex items-center gap-2 flex-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {!modelReady
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Cargando modelo...</>
                      : <><Play className="w-4 h-4" /> Iniciar análisis</>
                    }
                  </button>
                </>
              ) : isDone ? (
                <button
                  onClick={handleReset}
                  className="btn-outline flex items-center gap-2 flex-1 justify-center"
                >
                  <RotateCcw className="w-4 h-4" />
                  Analizar otro video
                </button>
              ) : (
                <>
                  {isProcessing ? (
                    <button
                      onClick={pause}
                      className="btn-outline flex items-center gap-2 flex-1 justify-center"
                    >
                      <Pause className="w-4 h-4" />
                      Pausar
                    </button>
                  ) : (
                    <button
                      onClick={resume}
                      className="btn-primary flex items-center gap-2 flex-1 justify-center"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Reanudar
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="btn-outline flex items-center gap-2 px-4"
                  >
                    <Square className="w-4 h-4 text-danger" />
                  </button>
                </>
              )}
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
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
            )}
          </AnimatePresence>

          <AnimatePresence>
            {(isActive || isDone) && latestFrame && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass rounded-sm px-4 py-3 grid grid-cols-3 gap-4"
              >
                {[
                  { label: "Inferencia",   value: `${latestFrame.inference_ms.toFixed(0)}ms` },
                  { label: "FPS servidor", value: fps                                         },
                  { label: "Frames proc.", value: framesProcessed                             },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="data-label">{label}</p>
                    <p className="font-mono text-sm text-text-primary mt-0.5">{value}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {latestFrame ? (
              <motion.div
                key="compliance"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
              >
                <ComplianceCard compliance={latestFrame.compliance} />
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass rounded-sm flex flex-col items-center justify-center min-h-[360px] border border-dashed border-border"
              >
                <div className="p-4 rounded-sm bg-panel border border-border mb-4">
                  <Activity className="w-8 h-8 text-text-muted" />
                </div>
                <p className="font-display text-sm text-text-secondary">
                  Esperando frames...
                </p>
                <p className="font-mono text-xs text-text-muted mt-1">
                  Inicia el análisis para ver resultados EPP
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
