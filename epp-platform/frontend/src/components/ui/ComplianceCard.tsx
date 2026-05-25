"use client"

import { motion } from "framer-motion"
import { CheckCircle2, XCircle, MinusCircle, ShieldCheck, ShieldX } from "lucide-react"
import type { ComplianceResult } from "@/types/epp"
import { cn, statusBorder } from "@/lib/utils"

interface ComplianceCardProps {
  compliance: ComplianceResult
  className?: string
}

export function ComplianceCard({ compliance, className }: ComplianceCardProps) {
  const isCompliant  = compliance.status === "COMPLIANT"
  const isViolation  = compliance.status === "VIOLATION"
  const isNoPerson   = compliance.status === "NO_PERSON"

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn(
        "rounded-sm p-5 transition-all duration-300",
        isCompliant ? "glass-neon" : isViolation ? "glass-danger" : "glass",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {isCompliant && <ShieldCheck className="w-5 h-5 text-neon" />}
          {isViolation && <ShieldX     className="w-5 h-5 text-danger" />}
          {isNoPerson  && <MinusCircle className="w-5 h-5 text-text-secondary" />}
          <span className="font-display font-semibold text-sm tracking-wider text-text-primary">
            Estado EPP
          </span>
        </div>

        {/* Badge de estado */}
        {isCompliant && <span className="badge-neon">✓ CUMPLE</span>}
        {isViolation && <span className="badge-danger">✗ NO CUMPLE</span>}
        {isNoPerson  && <span className="badge-neutral">SIN PERSONA</span>}
      </div>

      {/* Barra de progreso de compliance */}
      {!isNoPerson && (
        <div className="mb-5">
          <div className="flex justify-between items-baseline mb-2">
            <span className="data-label">Cumplimiento</span>
            <span className={cn(
              "font-mono font-bold text-2xl",
              isCompliant ? "text-neon text-glow-neon" : "text-danger text-glow-danger"
            )}>
              {compliance.compliance_pct}%
            </span>
          </div>
          <div className="h-1.5 bg-panel rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${compliance.compliance_pct}%` }}
              transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
              className={cn(
                "h-full rounded-full",
                isCompliant ? "bg-neon shadow-neon-sm" : "bg-danger shadow-danger-sm"
              )}
            />
          </div>
        </div>
      )}

      {/* Lista EPP */}
      {!isNoPerson && compliance.epp_items.length > 0 && (
        <div className="space-y-2">
          <span className="data-label block mb-3">Elementos EPP</span>
          {compliance.epp_items.map((item, i) => (
            <motion.div
              key={item.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.06 }}
              className={cn(
                "flex items-center justify-between px-3 py-2 rounded-sm",
                item.present ? "bg-neon-dark/50" : "bg-danger-dark/50"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{item.icon}</span>
                <span className="font-display text-sm text-text-primary">
                  {item.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {item.class_detected && (
                  <span className="font-mono text-[10px] text-text-muted hidden sm:block">
                    {item.class_detected}
                  </span>
                )}
                {item.present
                  ? <CheckCircle2 className="w-4 h-4 text-neon flex-shrink-0" />
                  : <XCircle      className="w-4 h-4 text-danger flex-shrink-0" />
                }
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Mensaje sin persona */}
      {isNoPerson && (
        <p className="font-mono text-sm text-text-secondary text-center py-4">
          No se detectó ninguna persona
        </p>
      )}

      {/* Resumen */}
      {!isNoPerson && (
        <div className="mt-4 pt-4 border-t border-border/40">
          <p className="font-mono text-xs text-text-secondary leading-relaxed">
            {compliance.summary}
          </p>
        </div>
      )}
    </motion.div>
  )
}
