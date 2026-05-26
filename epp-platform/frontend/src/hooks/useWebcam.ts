"use client"
 
import { useRef, useState, useCallback, useEffect } from "react"
import { createStreamSocket } from "@/lib/api"
import type { StreamFrame } from "@/types/epp"
 
export type WebcamStatus = "idle" | "starting" | "streaming" | "paused" | "error"
 
interface UseWebcamReturn {
  videoRef:        React.RefObject<HTMLVideoElement>
  canvasRef:       React.RefObject<HTMLCanvasElement>
  status:          WebcamStatus
  latestFrame:     StreamFrame | null
  fps:             number
  error:           string | null
  start:           () => Promise<void>
  stop:            () => void
  pause:           () => void
  resume:          () => void
}
 
const CAPTURE_INTERVAL_MS = 100
const JPEG_QUALITY        = 0.75
 
export function useWebcam(): UseWebcamReturn {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const socketRef   = useRef<WebSocket | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef   = useRef<MediaStream | null>(null)
 
  const [status,      setStatus]      = useState<WebcamStatus>("idle")
  const [latestFrame, setLatestFrame] = useState<StreamFrame | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [fps,         setFps]         = useState(0)
 
  const fpsCountRef = useRef(0)
  const fpsTimerRef = useRef<NodeJS.Timeout | null>(null)
 
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
        })
      },
      "image/jpeg",
      JPEG_QUALITY
    )
  }, [])
 
  const start = useCallback(async () => {
    setStatus("starting")
    setError(null)
 
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      })
      streamRef.current = stream
    } catch (e: any) {
      setError("No se pudo acceder a la cámara. Verifica los permisos.")
      setStatus("error")
      return
    }
 
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      await videoRef.current.play()
    }
 
    const socket = createStreamSocket()
    socketRef.current = socket
 
    socket.onopen = () => {
      setStatus("streaming")
      startFpsCounter()
      intervalRef.current = setInterval(captureAndSend, CAPTURE_INTERVAL_MS)
    }
 
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
      setError("Error de conexión WebSocket. Verifica que el servidor esté activo.")
      setStatus("error")
      stop()
    }
 
    socket.onclose = () => {
      if (status === "streaming") {
        setStatus("idle")
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captureAndSend])
 
  const stop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    stopFpsCounter()
 
    if (socketRef.current) {
      socketRef.current.onclose = null
      socketRef.current.close()
      socketRef.current = null
    }
 
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
 
    if (videoRef.current) videoRef.current.srcObject = null
 
    setStatus("idle")
    setLatestFrame(null)
  }, [])
 
  const pause = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    stopFpsCounter()
    setStatus("paused")
  }, [])
 
  const resume = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      intervalRef.current = setInterval(captureAndSend, CAPTURE_INTERVAL_MS)
      startFpsCounter()
      setStatus("streaming")
    }
  }, [captureAndSend])
 
  useEffect(() => {
    return () => { stop() }
  }, [stop])
 
  return {
    videoRef, canvasRef,
    status, latestFrame, fps, error,
    start, stop, pause, resume,
  }
}