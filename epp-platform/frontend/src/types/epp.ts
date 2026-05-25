// types/epp.ts
// Tipos TypeScript que reflejan los schemas del backend

export type ComplianceStatus =
  | "COMPLIANT"
  | "VIOLATION"
  | "NO_PERSON"

// -----------------------------------------------------------------------------
// EPP
// -----------------------------------------------------------------------------

export interface EPPItem {
  key: string
  label: string
  icon: string
  present: boolean
  class_detected: string
}

// -----------------------------------------------------------------------------
// Bounding Boxes
// -----------------------------------------------------------------------------

export interface BoundingBox {
  x1: number
  y1: number
  x2: number
  y2: number
  class_name: string
  confidence: number
  class_id: number
}

// -----------------------------------------------------------------------------
// Compliance
// -----------------------------------------------------------------------------

export interface ComplianceResult {
  status: ComplianceStatus
  compliant: boolean
  compliance_pct: number
  compliance_rate: number

  epp_items: EPPItem[]

  detected: string[]
  missing: string[]

  person_count: number
  total_detections: number

  access_allowed: boolean
  summary: string
}

// -----------------------------------------------------------------------------
// Image Detection
// -----------------------------------------------------------------------------

export interface ImageDetectionResult {
  job_id: string
  compliance: ComplianceResult
  boxes: BoundingBox[]
  inference_ms: number
  image_b64: string
}

// -----------------------------------------------------------------------------
// Video Detection
// -----------------------------------------------------------------------------

export type VideoJobStatus =
  | "pending"
  | "processing"
  | "done"
  | "error"

export interface VideoDetectionResult {
  job_id: string
  status: VideoJobStatus

  compliance: ComplianceResult

  frames_processed: number
  frames_skipped: number

  processing_time_sec: number
  output_size_kb: number

  download_url: string

  video_width: number
  video_height: number
  video_fps: number
  video_duration: number
}

// -----------------------------------------------------------------------------
// Webcam / Stream
// -----------------------------------------------------------------------------

export interface StreamFrame {
  frame_index: number
  compliance: ComplianceResult
  inference_ms: number
  annotated_frame: string // base64 JPEG
}

// -----------------------------------------------------------------------------
// Frontend Job Status
// -----------------------------------------------------------------------------

export type JobStatus =
  | "idle"
  | "uploading"
  | "processing"
  | "done"
  | "error"