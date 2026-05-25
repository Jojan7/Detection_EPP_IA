/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      // ── Tipografía ──────────────────────────────────────────────
      fontFamily: {
        mono:    ["Space Mono", "monospace"],
        display: ["Syne", "sans-serif"],
        body:    ["Syne", "sans-serif"],
      },

      // ── Paleta industrial-futurista ──────────────────────────────
      colors: {
        // Fondos
        void:    "#020407",      // negro casi puro
        surface: "#080e12",      // superficie base
        panel:   "#0d1a20",      // panels
        card:    "#0f2028",      // tarjetas

        // Bordes y líneas
        border:  "#1a3040",
        "border-bright": "#2a4a60",

        // Acento principal — verde neón industrial
        neon: {
          DEFAULT: "#00ff88",
          dim:     "#00cc6a",
          dark:    "#004422",
          glow:    "rgba(0,255,136,0.15)",
        },

        // Violación EPP — rojo alerta
        danger: {
          DEFAULT: "#ff3355",
          dim:     "#cc2244",
          dark:    "#330011",
          glow:    "rgba(255,51,85,0.15)",
        },

        // Advertencia — ámbar
        warn: {
          DEFAULT: "#ffaa00",
          dim:     "#cc8800",
          dark:    "#332200",
        },

        // Textos
        "text-primary":   "#e8f4f8",
        "text-secondary": "#7a9aaa",
        "text-muted":     "#3a5a6a",
      },

      // ── Sombras con glow ──────────────────────────────────────────
      boxShadow: {
        "neon-sm":   "0 0 8px rgba(0,255,136,0.3)",
        "neon-md":   "0 0 20px rgba(0,255,136,0.2), 0 0 40px rgba(0,255,136,0.08)",
        "neon-lg":   "0 0 40px rgba(0,255,136,0.25), 0 0 80px rgba(0,255,136,0.1)",
        "danger-sm": "0 0 8px rgba(255,51,85,0.3)",
        "danger-md": "0 0 20px rgba(255,51,85,0.2), 0 0 40px rgba(255,51,85,0.08)",
        "glass":     "0 8px 32px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
        "panel":     "0 4px 24px rgba(0,0,0,0.8)",
      },

      // ── Animaciones ───────────────────────────────────────────────
      keyframes: {
        "pulse-neon": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.4" },
        },
        "scan-line": {
          "0%":   { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "fade-in-up": {
          "0%":   { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          "0%":   { opacity: "0", transform: "translateX(24px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "grid-glow": {
          "0%, 100%": { opacity: "0.03" },
          "50%":      { opacity: "0.07" },
        },
      },
      animation: {
        "pulse-neon":    "pulse-neon 2s ease-in-out infinite",
        "scan-line":     "scan-line 8s linear infinite",
        "fade-in-up":    "fade-in-up 0.5s ease-out forwards",
        "slide-in-right":"slide-in-right 0.4s ease-out forwards",
        "grid-glow":     "grid-glow 4s ease-in-out infinite",
      },

      // ── Backdrop blur ─────────────────────────────────────────────
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
}
