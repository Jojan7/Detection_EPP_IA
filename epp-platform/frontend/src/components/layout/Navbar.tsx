"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Shield, Activity, Video, Image, Wifi } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_LINKS = [
  { href: "/",        label: "Dashboard",  icon: Activity },
  { href: "/image",   label: "Imagen",     icon: Image    },
  { href: "/video",   label: "Video",      icon: Video    },
  { href: "/webcam",  label: "Webcam",     icon: Wifi     },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 glass border-b border-border">
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <div className="absolute inset-0 bg-neon/10 rounded-sm group-hover:bg-neon/20 transition-colors" />
            <Shield className="w-5 h-5 text-neon relative z-10" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-display font-bold text-sm text-text-primary tracking-wider">
              EPP<span className="text-neon">AI</span>
            </span>
            <span className="font-mono text-[9px] text-text-muted tracking-widest uppercase">
              Detection Platform
            </span>
          </div>
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-sm text-sm font-display font-medium tracking-wide transition-all duration-200",
                  active
                    ? "bg-neon/10 text-neon border border-neon/20"
                    : "text-text-secondary hover:text-text-primary hover:bg-panel"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon animate-pulse-neon shadow-neon-sm" />
          <span className="font-mono text-xs text-text-muted hidden sm:block">ONLINE</span>
        </div>
      </div>
    </header>
  )
}
