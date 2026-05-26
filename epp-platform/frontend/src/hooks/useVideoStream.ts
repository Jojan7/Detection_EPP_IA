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
  progress:        number
  framesProcessed: number
  fps:             number
  error:           string | null
  start:           (file: File) => Promise<void>
  stop:            () => void
  pause:           () => void
  resume:          () => void
}

const JPEG_QUALITY = 0.80

export function useVideoStream(): UseVideoStreamReturn {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const socketRef   = useRef<WebSocket | null>(null)

  // Semáforo: true = esperando respuesta del servidor, no enviar más frames
  const waitingRef      = useRef(false)
  const pausedRef       = useRef(false)
  const activeRef       = useRef(false)
  const frameCountRef   = useRef(0)
  const fpsCountRef     = useRef(0)
  const fpsTimerRef     = useRef<NodeJS.Timeout | null>(null)
  const animFrameRef    = useRef<number | null>(null)

  const [status,          setStatus]          = useState<VideoStreamStatus>("idle")
  const [latestFrame,     setLatestFrame]     = useState<StreamFrame | null>(null)
  const [progress,        setProgress]        = useState(0)
  const [framesProcessed, setFramesProcessed] = useState(0)
  const [fps,             setFps]             = useState(0)
  const [error,           setError]           = useState<string | null>(null)

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

  const stop = useCallback(() => {
    activeRef.current = false
    pausedRef.current = false
    waitingRef.current = false

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
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

  // Loop principal: captura y envía UN frame, luego espera respuesta
  const captureLoop = useCallback(() => {
    const video  = videoRef.current
    const canvas = canvasRef.current
    const socket = socketRef.current

    if (!activeRef.current || pausedRef.current) return

    // Si el video terminó
    if (video && (video.ended || video.currentTime >= video.duration)) {
      stopFpsCounter()
      setProgress(100)
      setStatus("done")
      return
    }

    // Si estamos esperando respuesta del servidor, volver a intentar en el próximo frame
    if (waitingRef.current) {
      animFrameRef.current = requestAnimationFrame(captureLoop)
      return
    }

    if (!video || !canvas || !socket || socket.readyState !== WebSocket.OPEN) {
      animFrameRef.current = requestAnimationFrame(captureLoop)
      return
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      animFrameRef.current = requestAnimationFrame(captureLoop)
      return
    }

    // Actualizar progreso
    if (video.duration > 0) {
      setProgress(Math.round((video.currentTime / video.duration) * 100))
    }

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      animFrameRef.current = requestAnimationFrame(captureLoop)
      return
    }

    // Capturar frame actual
    canvas.width  = video.videoWidth  || 640
    canvas.height = video.videoHeight || 480
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    // Marcar como esperando ANTES de enviar
    waitingRef.current = true

    // Pausar el video mientras el servidor procesa
    video.pause()

    canvas.toBlob(
      (blob) => {
        if (!blob || !activeRef.current) {
          waitingRef.current = false
          return
        }
        blob.arrayBuffer().then((buf) => {
          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(buf)
          } else {
            waitingRef.current = false
          }
        })
      },
      "image/jpeg",
      JPEG_QUALITY
    )

    // Continuar el loop
    animFrameRef.current = requestAnimationFrame(captureLoop)
  }, [])

  const start = useCallback(async (file: File) => {
    setStatus("processing")
    setError(null)
    setLatestFrame(null)
    setProgress(0)
    setFramesProcessed(0)
    frameCountRef.current = 0
    waitingRef.current = false
    pausedRef.current = false
    activeRef.current = true

    const video = videoRef.current
    if (!video) return

    // Cargar video
    const url = URL.createObjectURL(file)
    video.src = url
    video.muted = true
    video.playbackRate = 1.0

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error("No se pudo cargar el video"))
    })

    // Conectar WebSocket
    const socket = createStreamSocket()
    socketRef.current = socket

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve()
      socket.onerror = () => reject(new Error("No se pudo conectar al servidor"))
      setTimeout(() => reject(new Error("Timeout conectando WebSocket")), 10000)
    })

    // Cuando recibe respuesta: mostrar frame anotado y reanudar video
    socket.onmessage = (event) => {
      try {
        const frame: StreamFrame = JSON.parse(event.data)
        setLatestFrame(frame)
        fpsCountRef.current++
        frameCountRef.current++
        setFramesProcessed(frameCountRef.current)

        // Liberar semáforo y reanudar video
        waitingRef.current = false
        if (activeRef.current && !pausedRef.current) {
          videoRef.current?.play()
        }
      } catch {
        waitingRef.current = false
      }
    }

    socket.onerror = () => {
      setError("Error de conexión WebSocket.")
      setStatus("error")
      stop()
    }

    socket.onclose = () => {
      stopFpsCounter()
    }

    video.onended = () => {
      activeRef.current = false
      stopFpsCounter()
      setProgress(100)
      setStatus("done")
      URL.revokeObjectURL(url)
    }

    // Iniciar video y loop
    await video.play()
    startFpsCounter()
    animFrameRef.current = requestAnimationFrame(captureLoop)

  }, [captureLoop, stop])

  const pause = useCallback(() => {
    pausedRef.current = true
    videoRef.current?.pause()
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    stopFpsCounter()
    setStatus("paused")
  }, [])

  const resume = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      pausedRef.current = false
      waitingRef.current = false
      videoRef.current?.play()
      startFpsCounter()
      animFrameRef.current = requestAnimationFrame(captureLoop)
      setStatus("processing")
    }
  }, [captureLoop])

  useEffect(() => {
    return () => { stop() }
  }, [stop])

  return {
    videoRef, canvasRef,
    status, latestFrame, progress, framesProcessed, fps, error,
    start, stop, pause, resume,
  }
}