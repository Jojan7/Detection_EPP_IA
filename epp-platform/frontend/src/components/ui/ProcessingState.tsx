"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface ProcessingStateProps {
  label?:     string
  progress?:  number   // 0-100, undefined = indeterminado
  className?: string
}

export function ProcessingState({
  label = "Procesando...",
  progress,
  className,
}: ProcessingStateProps) {
  const isIndeterminate = progress === undefined

  return (
    <div className={cn("flex flex-col items-center gap-5 py-10", className)}>
      {/* Spinner hexagonal */}
      <div className="relative w-16 h-16">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-neon"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="absolute inset-2 rounded-full border border-transparent border-t-neon/40"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-neon animate-pulse-neon shadow-neon-sm" />
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <p className="font-display text-sm text-text-primary">{label}</p>
        {progress !== undefined && (
          <p className="font-mono text-xs text-text-muted mt-1">{progress}%</p>
        )}
      </div>

      {/* Barra de progreso */}
      <div className="w-full max-w-xs h-1 bg-panel rounded-full overflow-hidden">
        {isIndeterminate ? (
          <motion.div
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-neon to-transparent"
          />
        ) : (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
            className="h-full bg-neon shadow-neon-sm rounded-full"
          />
        )}
      </div>
    </div>
  )
}
