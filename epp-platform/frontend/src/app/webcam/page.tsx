"use client"

import { motion, AnimatePresence } from "framer-motion"
import { Wifi, Play, Square, Pause, RefreshCw, Activity } from "lucide-react"
import { useWebcam } from "@/hooks/useWebcam"
import { ComplianceCard } from "@/components/ui/ComplianceCard"
import { cn } from "@/lib/utils"

const STATUS_LABELS: Record<string, string> = {
  idle:      "INACTIVO",
  starting:  "INICIANDO...",
  streaming: "EN VIVO",
  paused:    "PAUSADO",
  error:     "ERROR",
}

const STATUS_COLORS: Record<string, string> = {
  idle:      "text-text-muted",
  starting:  "text-warn",
  streaming: "text-neon",
  paused:    "text-warn",
  error:     "text-danger",
}

export default function WebcamPage() {
  const {
    videoRef, canvasRef,
    status, latestFrame, fps, error,
    start, stop, pause, resume,
  } = useWebcam()

  const isLive    = status === "streaming"
  const isPaused  = status === "paused"
  const isActive  = isLive || isPaused
  const isLoading = status === "starting"

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-3">
          <Wifi className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs text-text-muted tracking-widest uppercase">
            Detección en Tiempo Real
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold text-text-primary">
          Webcam — Live EPP
        </h1>
        <p className="font-body text-sm text-text-secondary mt-1">
          Detección EPP continua desde tu cámara via WebSocket. ~8-10 FPS en CPU.
        </p>
      </motion.div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6">

        {/* Columna principal — Cámara */}
        <div className="space-y-4">

          {/* Viewport de cámara */}
          <div className="glass rounded-sm overflow-hidden relative">

            {/* Status bar */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2
                            bg-gradient-to-b from-void/80 to-transparent pointer-events-none">
              <div className="flex items-center gap-2">
                <span className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  isLive    ? "bg-neon animate-pulse-neon shadow-neon-sm" :
                  isPaused  ? "bg-warn" :
                  isLoading ? "bg-warn animate-pulse" :
                  "bg-text-muted"
                )} />
                <span className={cn("font-mono text-xs", STATUS_COLORS[status])}>
                  {STATUS_LABELS[status]}
                </span>
              </div>

              {isLive && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Activity className="w-3 h-3 text-neon" />
                    <span className="font-mono text-xs text-neon">{fps} FPS</span>
                  </div>
                  {latestFrame && (
                    <span className="font-mono text-xs text-text-muted">
                      #{latestFrame.frame_index}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Video element (siempre en DOM para que el hook pueda accederlo) */}
            <div className="relative bg-void aspect-video">
              <video
                ref={videoRef}
                className={cn(
                  "w-full h-full object-cover",
                  !isActive && "opacity-0"
                )}
                muted
                playsInline
              />

              {/* Frame anotado superpuesto sobre el video */}
              <AnimatePresence>
                {isLive && latestFrame?.annotated_frame && (
                  <motion.img
                    key={latestFrame.frame_index}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.05 }}
                    src={`data:image/jpeg;base64,${latestFrame.annotated_frame}`}
                    alt="Frame anotado"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
              </AnimatePresence>

              {/* Placeholder cuando está inactivo */}
              {!isActive && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  <div className="p-5 rounded-sm bg-panel border border-border">
                    <Wifi className="w-10 h-10 text-text-muted" />
                  </div>
                  <p className="font-display text-sm text-text-secondary">
                    Cámara inactiva
                  </p>
                </div>
              )}

              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/60">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="w-10 h-10 rounded-full border-2 border-transparent border-t-neon"
                  />
                  <p className="font-mono text-xs text-neon">Inicializando cámara...</p>
                </div>
              )}
            </div>

            {/* Canvas oculto para captura de frames */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Controles */}
            <div className="flex items-center gap-3 p-4 border-t border-border">
              {!isActive ? (
                <button
                  onClick={start}
                  disabled={isLoading}
                  className="btn-primary flex items-center gap-2 flex-1 justify-center"
                >
                  <Play className="w-4 h-4" />
                  Iniciar detección
                </button>
              ) : (
                <>
                  {isLive ? (
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
                    onClick={stop}
                    className="btn-outline flex items-center gap-2 px-4"
                  >
                    <Square className="w-4 h-4 text-danger" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass-danger rounded-sm p-4"
              >
                <p className="font-mono text-sm text-danger">⚠ {error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Info de latencia */}
          <AnimatePresence>
            {isLive && latestFrame && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass rounded-sm px-4 py-3 grid grid-cols-3 gap-4"
              >
                {[
                  { label: "Inferencia",  value: `${latestFrame.inference_ms.toFixed(0)}ms` },
                  { label: "FPS server",  value: fps                                        },
                  { label: "Frames proc.", value: latestFrame.frame_index                   },
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

        {/* Columna derecha — Compliance en tiempo real */}
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
                  Inicia la detección para ver resultados
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Instrucciones */}
          {!isActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass rounded-sm p-5 space-y-3"
            >
              <p className="font-display text-sm text-text-secondary font-semibold">
                ¿Cómo funciona?
              </p>
              {[
                "Tu cámara captura frames a 10fps",
                "Cada frame se envía al servidor via WebSocket",
                "YOLOv8 detecta los EPP en tiempo real",
                "El resultado se muestra con bounding boxes",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="font-mono text-xs text-neon mt-0.5 flex-shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="font-body text-xs text-text-secondary">{text}</p>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
