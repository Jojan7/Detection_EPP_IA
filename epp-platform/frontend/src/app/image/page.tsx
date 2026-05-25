"use client"

import { useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Image as ImageIcon, Zap, Download, RotateCcw } from "lucide-react"
import { api } from "@/lib/api"
import type { ImageDetectionResult, JobStatus } from "@/types/epp"
import { UploadZone }      from "@/components/ui/UploadZone"
import { ComplianceCard }  from "@/components/ui/ComplianceCard"
import { ProcessingState } from "@/components/ui/ProcessingState"

export default function ImagePage() {
  const [file,     setFile]     = useState<File | null>(null)
  const [status,   setStatus]   = useState<JobStatus>("idle")
  const [result,   setResult]   = useState<ImageDetectionResult | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  const handleFile = useCallback((f: File) => {
    setFile(f)
    setResult(null)
    setError(null)
    setStatus("idle")
  }, [])

  const handleDetect = async () => {
    if (!file) return
    setStatus("processing")
    setError(null)
    setProgress(0)

    try {
      const res = await api.detectImage(file, setProgress)
      setResult(res)
      setStatus("done")
    } catch (e: any) {
      setError(e.message)
      setStatus("error")
    }
  }

  const handleReset = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setStatus("idle")
    setProgress(0)
  }

  const downloadAnnotated = () => {
    if (!result) return
    const a = document.createElement("a")
    a.href = `data:image/jpeg;base64,${result.image_b64}`
    a.download = `epp_resultado_${result.job_id}.jpg`
    a.click()
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 mb-3">
          <ImageIcon className="w-4 h-4 text-neon" />
          <span className="font-mono text-xs text-text-muted tracking-widest uppercase">
            Detección en Imagen
          </span>
        </div>
        <h1 className="font-display text-3xl font-bold text-text-primary">
          Análisis EPP — Imagen
        </h1>
        <p className="font-body text-sm text-text-secondary mt-1">
          Sube una imagen para detectar los 5 EPP y verificar cumplimiento normativa.
        </p>
      </motion.div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Columna izquierda — Upload + acción */}
        <div className="space-y-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            <UploadZone
              accept="image"
              onFile={handleFile}
              disabled={status === "processing"}
              className="min-h-[260px]"
            />
          </motion.div>

          <AnimatePresence mode="wait">
            {status === "processing" ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass rounded-sm"
              >
                <ProcessingState
                  label="Ejecutando inferencia YOLOv8..."
                  progress={progress > 0 ? progress : undefined}
                />
              </motion.div>

            ) : status === "error" ? (
              <motion.div
                key="error"
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
                key="actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex gap-3"
              >
                <button
                  onClick={handleDetect}
                  disabled={!file || status === "processing"}
                  className="btn-primary flex items-center gap-2 flex-1 justify-center"
                >
                  <Zap className="w-4 h-4" />
                  Detectar EPP
                </button>

                {status === "done" && (
                  <>
                    <button onClick={downloadAnnotated} className="btn-outline flex items-center gap-2">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={handleReset} className="btn-outline flex items-center gap-2">
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Metadata del resultado */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass rounded-sm p-4 grid grid-cols-3 gap-4"
              >
                {[
                  { label: "Inferencia",   value: `${result.inference_ms}ms`           },
                  { label: "Detecciones",  value: result.boxes.length                   },
                  { label: "Job ID",       value: result.job_id                         },
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

        {/* Columna derecha — Resultado */}
        <div className="space-y-4">
          <AnimatePresence mode="wait">
            {status === "done" && result ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                {/* Imagen anotada */}
                <div className="glass rounded-sm overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`data:image/jpeg;base64,${result.image_b64}`}
                    alt="Resultado anotado"
                    className="w-full object-contain max-h-80 bg-void"
                  />
                  <div className="px-4 py-2 border-t border-border flex items-center justify-between">
                    <span className="data-label">Imagen procesada</span>
                    <button
                      onClick={downloadAnnotated}
                      className="font-mono text-xs text-neon hover:text-neon-dim flex items-center gap-1 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Descargar
                    </button>
                  </div>
                </div>

                {/* Card de compliance */}
                <ComplianceCard compliance={result.compliance} />
              </motion.div>

            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass rounded-sm flex flex-col items-center justify-center min-h-[400px] border border-dashed border-border"
              >
                <div className="p-4 rounded-sm bg-panel border border-border mb-4">
                  <ImageIcon className="w-8 h-8 text-text-muted" />
                </div>
                <p className="font-display text-sm text-text-secondary">
                  El resultado aparecerá aquí
                </p>
                <p className="font-mono text-xs text-text-muted mt-1">
                  Sube una imagen y presiona Detectar
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
