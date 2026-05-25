import type { Metadata } from "next"
import "./globals.css"
import { Navbar } from "@/components/layout/Navbar"

export const metadata: Metadata = {
  title: "EPP AI — Detection Platform",
  description: "Sistema profesional de detección de Equipos de Protección Personal con IA",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-void font-body">
        <Navbar />
        <main className="relative z-10 pt-16">
          {children}
        </main>
      </body>
    </html>
  )
}
