// lib/utils.ts — Utilidades compartidas

import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ComplianceStatus } from "@/types/epp"

/** Merge Tailwind clases sin conflictos */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Color Tailwind según estado de compliance */
export function statusColor(status: ComplianceStatus): string {
  return {
    COMPLIANT: "text-neon",
    VIOLATION: "text-danger",
    NO_PERSON: "text-text-secondary",
  }[status]
}

/** Borde según estado */
export function statusBorder(status: ComplianceStatus): string {
  return {
    COMPLIANT: "border-neon/40 shadow-neon-sm",
    VIOLATION: "border-danger/40 shadow-danger-sm",
    NO_PERSON: "border-border",
  }[status]
}

/** Formatea bytes a unidad legible */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Formatea segundos a mm:ss */
export function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}
