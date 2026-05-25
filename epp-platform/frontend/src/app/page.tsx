"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import {
  Shield, Image, Video, Wifi,
  ChevronRight, Activity, Zap, Eye
} from "lucide-react"

const FEATURES = [
  {
    href:        "/image",
    icon:        Image,
    title:       "Detección en Imagen",
    description: "Sube una fotografía y obtén análisis EPP completo en segundos.",
    badge:       "< 2s",
    badgeLabel:  "tiempo",
  },
  {
    href:        "/video",
    icon:        Video,
    title:       "Detección en Video",
    description: "Procesa un video completo frame a frame. Descarga el resultado anotado.",
    badge:       "MP4",
    badgeLabel:  "output",
  },
  {
    href:        "/webcam",
    icon:        Wifi,
    title:       "Webcam en Tiempo Real",
    description: "Detección continua desde tu cámara via WebSocket.",
    badge:       "LIVE",
    badgeLabel:  "stream",
  },
]

const EPP_ITEMS = [
  { icon: "⛑️", label: "Casco",   key: "helmet"  },
  { icon: "🦺", label: "Chaleco", key: "vest"    },
  { icon: "🥽", label: "Gafas",   key: "goggles" },
  { icon: "🧤", label: "Guantes", key: "gloves"  },
  { icon: "👢", label: "Botas",   key: "boots"   },
]

const STATS = [
  { icon: Eye,      value: "11",    label: "Clases YOLO",    sub: "detectadas"  },
  { icon: Zap,      value: "0.45",  label: "Confianza",      sub: "threshold"   },
  { icon: Activity, value: "57.4%", label: "mAP@50",         sub: "precisión"   },
  { icon: Shield,   value: "5",     label: "EPP Verificados", sub: "por persona" },
]

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10">

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-14"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 bg-neon rounded-full animate-pulse-neon shadow-neon-sm" />
          <span className="font-mono text-xs text-text-muted tracking-widest uppercase">
            Sistema Activo — YOLOv8
          </span>
        </div>

        <h1 className="font-display text-5xl md:text-6xl font-extrabold text-text-primary leading-none mb-4">
          EPP<span className="text-neon text-glow-neon">AI</span>
          <br />
          <span className="text-text-secondary text-3xl md:text-4xl font-semibold">
            Detection Platform
          </span>
        </h1>

        <p className="font-body text-text-secondary max-w-xl text-base leading-relaxed">
          Detección automática de Equipos de Protección Personal en imágenes,
          videos y webcam en tiempo real. Verificación de cumplimiento normativa
          con IA industrial.
        </p>
      </motion.div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {STATS.map(({ icon: Icon, value, label, sub }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.07 }}
            className="glass rounded-sm p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-3.5 h-3.5 text-neon" />
              <span className="data-label">{sub}</span>
            </div>
            <div className="font-mono text-xl font-bold text-text-primary">{value}</div>
            <div className="font-display text-xs text-text-secondary mt-0.5">{label}</div>
          </motion.div>
        ))}
      </div>

      {/* Feature cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-10">
        {FEATURES.map(({ href, icon: Icon, title, description, badge, badgeLabel }, i) => (
          <motion.div
            key={href}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.1 }}
          >
            <Link href={href} className="block h-full group">
              <div className="glass rounded-sm p-6 h-full border border-border hover:border-neon/30 hover:shadow-neon-sm transition-all duration-300">
                <div className="flex items-start justify-between mb-5">
                  <div className="p-3 rounded-sm bg-panel border border-border group-hover:border-neon/30 group-hover:bg-neon/5 transition-colors">
                    <Icon className="w-5 h-5 text-text-secondary group-hover:text-neon transition-colors" />
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-lg font-bold text-neon">{badge}</div>
                    <div className="data-label">{badgeLabel}</div>
                  </div>
                </div>

                <h3 className="font-display font-semibold text-text-primary mb-2 group-hover:text-neon transition-colors">
                  {title}
                </h3>
                <p className="font-body text-sm text-text-secondary leading-relaxed mb-5">
                  {description}
                </p>

                <div className="flex items-center gap-1 text-xs font-mono text-text-muted group-hover:text-neon transition-colors">
                  <span>Abrir</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* EPP reference */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="glass rounded-sm p-6"
      >
        <div className="flex items-center gap-2 mb-5">
          <Shield className="w-4 h-4 text-neon" />
          <h2 className="font-display font-semibold text-text-primary">
            EPP Verificados
          </h2>
          <span className="badge-neon ml-auto">5 elementos</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {EPP_ITEMS.map(({ icon, label, key }) => (
            <div
              key={key}
              className="flex flex-col items-center gap-2 p-4 rounded-sm bg-panel border border-border hover:border-neon/20 transition-colors"
            >
              <span className="text-2xl">{icon}</span>
              <span className="font-display text-xs text-text-secondary text-center">{label}</span>
              <span className="font-mono text-[9px] text-text-muted tracking-wider">{key}</span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
