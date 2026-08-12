/**
 * Document Management Types for MinIO Integration
 * @module DocumentHub/types
 */

/**
 * Represents a single document stored in MinIO
 * Documents are stored at the family level and shared by all applicants in the family
 */
export interface Document {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  category?: 'receipt' | 'application-review' | 'general'
  uploadedAt: string
  uploadedBy: string
  familyHeadId: string // Family-level storage - shared by all applicants
  minio: {
    bucket: string
    key: string
    etag: string
  }
  preview?: {
    thumbnail?: string
    previewUrl?: string
  }
  deleted?: boolean
}

/**
 * Real-time progress of a file upload
 */
export interface UploadProgress {
  fileId: string
  fileName: string
  progress: number // 0-100
  status: 'pending' | 'uploading' | 'success' | 'error'
  error?: string
  uploadedBytes?: number
  totalBytes?: number
}

/**
 * Connection status to MinIO server
 */
export interface MinioStatus {
  connected: boolean
  ping?: number // latency in milliseconds
  timestamp: string
  endpoint: string
  mode?: 'primary' | 'fallback-upload-only' | 'offline'
  fallback?: {
    configured: boolean
    connected: boolean
    endpoint?: string | null
    bucket?: string
    ping?: number | null
    error?: string
  }
  capabilities?: {
    upload: boolean
    previewDownload: boolean
    uploadOnlyFallback: boolean
  }
  error?: string
}

/**
 * File validation result
 */
export interface ValidationResult {
  valid: boolean
  error?: string
  details?: {
    fieldName: string
    message: string
  }[]
}
