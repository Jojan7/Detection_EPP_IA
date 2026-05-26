"use client"

import { useRef, useState, useCallback, useEffect } from "react"
import { createStreamSocket } from "@/lib/api"
import type { StreamFrame } from "@/types/epp"

export type VideoStreamStatus = "idle" | "processing" | "paused" | "done" | "error"

interface UseVideoStreamReturn {
  videoRef:        React.RefObject<HTMLVideoElement>
  canvasRef:       React.RefObject<HTMLCanvasElement>
  status:          VideoStreamStatus
  latestFrame:     StreamFrame | null
  progress:        number   // 0-100
  framesProcessed: number
  fps:             number
  error:           string | null
  start:           (file: File) => Promise<void>
  stop:            () => void
  pause:           () => void
  resume:          () => void
}

// Intervalo entre frames enviados al servidor (ms)
// 150ms = ~6fps — balance entre velocidad y no saturar CPU del servidor
const FRAME_INTERVAL_MS = 150
const JPEG_QUALITY      = 0.75

export function useVideoStream(): UseVideoStreamReturn {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const socketRef   = useRef<WebSocket | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const [status,          setStatus]          = useState<VideoStreamStatus>("idle")
  const [latestFrame,     setLatestFrame]     = useState<StreamFrame | null>(null)
  const [progress,        setProgress]        = useState(0)
  const [framesProcessed, setFramesProcessed] = useState(0)
  const [fps,             setFps]             = useState(0)
  const [error,           setError]           = useState<string | null>(null)

  const fpsCountRef = useRef(0)
  const fpsTimerRef = useRef<NodeJS.Timeout | null>(null)
  const frameCountRef = useRef(0)

  const startFpsCounter = () => {
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current)
      fpsCountRef.current = 0
    }, 1000)
  }

  const stopFpsCounter = () => {
    if (fpsTimerRef.current) clearInterval(fpsTimerRef.current)
    setFps(0)
    fpsCountRef.current = 0
  }

  const captureAndSend = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    const socket = socketRef.current

    if (!video || !canvas || !socket || socket.readyState !== WebSocket.OPEN) return
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    // Si el video terminó, detener
    if (video.ended || video.currentTime >= video.duration) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      stopFpsCounter()
      setStatus("done")
      return
    }

    // Actualizar progreso basado en tiempo del video
    const pct = video.duration > 0
      ? Math.round((video.currentTime / video.duration) * 100)
      : 0
    setProgress(pct)

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob || socketRef.current?.readyState !== WebSocket.OPEN) return
        blob.arrayBuffer().then((buf) => {
          socketRef.current?.send(buf)
          frameCountRef.current++
          setFramesProcessed(frameCountRef.current)
        })
      },
      "image/jpeg",
      JPEG_QUALITY
    )
  }, [])

  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    stopFpsCounter()

    if (socketRef.current) {
      socketRef.current.onclose = null
      socketRef.current.close()
      socketRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ""
    }

    setStatus("idle")
    setLatestFrame(null)
    setProgress(0)
    setFramesProcessed(0)
    frameCountRef.current = 0
  }, [])

  const start = useCallback(async (file: File) => {
    setStatus("processing")
    setError(null)
    setLatestFrame(null)
    setProgress(0)
    setFramesProcessed(0)
    frameCountRef.current = 0

    // 1. Cargar video en el elemento <video>
    const video = videoRef.current
    if (!video) return

    const url = URL.createObjectURL(file)
    video.src = url
    video.muted = true

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error("No se pudo cargar el video"))
    })

    // 2. Abrir WebSocket
    const socket = createStreamSocket()
    socketRef.current = socket

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve()
      socket.onerror = () => reject(new Error("No se pudo conectar al servidor"))
    })

    // 3. Reproducir video y empezar a capturar frames
    video.play()
    startFpsCounter()
    intervalRef.current = setInterval(captureAndSend, FRAME_INTERVAL_MS)

    socket.onmessage = (event) => {
      try {
        const frame: StreamFrame = JSON.parse(event.data)
        setLatestFrame(frame)
        fpsCountRef.current++
      } catch {
        // frame inválido — ignorar
      }
    }

    socket.onerror = () => {
      setError("Error de conexión WebSocket.")
      setStatus("error")
      stop()
    }

    socket.onclose = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      stopFpsCounter()
    }

    // Cuando el video termina
    video.onended = () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      stopFpsCounter()
      setProgress(100)
      setStatus("done")
      URL.revokeObjectURL(url)
    }

  }, [captureAndSend, stop])

  const pause = useCallback(() => {
    videoRef.current?.pause()
    if (intervalRef.current) clearInterval(intervalRef.current)
    stopFpsCounter()
    setStatus("paused")
  }, [])

  const resume = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      videoRef.current?.play()
      intervalRef.current = setInterval(captureAndSend, FRAME_INTERVAL_MS)
      startFpsCounter()
      setStatus("processing")
    }
  }, [captureAndSend])

  useEffect(() => {
    return () => { stop() }
  }, [stop])

  return {
    videoRef, canvasRef,
    status, latestFrame, progress, framesProcessed, fps, error,
    start, stop, pause, resume,
  }
}
