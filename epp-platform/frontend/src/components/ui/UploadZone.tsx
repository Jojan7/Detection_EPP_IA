"use client"

import { useRef, useState, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, FileImage, FileVideo, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface UploadZoneProps {
  accept:     "image" | "video"
  onFile:     (file: File) => void
  disabled?:  boolean
  className?: string
}

const ACCEPT_MAP = {
  image: "image/jpeg,image/png,image/webp",
  video: "video/mp4,video/avi,video/quicktime",
}

const LABEL_MAP = {
  image: { main: "Arrastra tu imagen aquí",  sub: "JPEG, PNG, WebP — máx. 10MB", Icon: FileImage },
  video: { main: "Arrastra tu video aquí",   sub: "MP4, AVI, MOV — máx. 100MB", Icon: FileVideo },
}

export function UploadZone({ accept, onFile, disabled, className }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [preview,  setPreview]  = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { main, sub, Icon } = LABEL_MAP[accept]

  const handleFile = useCallback((file: File) => {
    setFileName(file.name)
    if (accept === "image") {
      const url = URL.createObjectURL(file)
      setPreview(url)
    } else {
      setPreview(null)
    }
    onFile(file)
  }, [accept, onFile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setPreview(null)
    setFileName(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div
      className={cn(
        "relative rounded-sm border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden",
        dragging
          ? "border-neon bg-neon/5 shadow-neon-sm"
          : fileName
          ? "border-neon/40 bg-neon-dark/20"
          : "border-border hover:border-border-bright bg-panel/50",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MAP[accept]}
        className="hidden"
        disabled={disabled}
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      <AnimatePresence mode="wait">
        {/* Preview de imagen */}
        {preview && accept === "image" ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Preview" className="w-full max-h-64 object-contain bg-void" />
            <button
              onClick={clear}
              className="absolute top-2 right-2 p-1 bg-void/80 rounded-sm border border-border hover:border-danger hover:text-danger text-text-secondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>

        ) : fileName ? (
          /* Video seleccionado */
          <motion.div
            key="file"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-3 py-10"
          >
            <div className="p-4 rounded-sm bg-neon-dark border border-neon/30">
              <Icon className="w-8 h-8 text-neon" />
            </div>
            <div className="text-center">
              <p className="font-display text-sm text-text-primary">{fileName}</p>
              <p className="font-mono text-xs text-text-muted mt-1">Archivo listo</p>
            </div>
            <button
              onClick={clear}
              className="font-mono text-xs text-text-muted hover:text-danger transition-colors"
            >
              Cambiar archivo
            </button>
          </motion.div>

        ) : (
          /* Estado vacío */
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-4 py-12 px-6"
          >
            <motion.div
              animate={dragging ? { scale: 1.1 } : { scale: 1 }}
              className={cn(
                "p-4 rounded-sm border transition-colors",
                dragging ? "bg-neon/10 border-neon/40" : "bg-panel border-border"
              )}
            >
              <Upload className={cn("w-8 h-8", dragging ? "text-neon" : "text-text-muted")} />
            </motion.div>
            <div className="text-center">
              <p className="font-display text-sm text-text-primary">{main}</p>
              <p className="font-mono text-xs text-text-muted mt-1">{sub}</p>
            </div>
            <span className="font-mono text-xs text-neon/60 border border-neon/20 px-3 py-1 rounded-sm">
              o haz clic para seleccionar
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
