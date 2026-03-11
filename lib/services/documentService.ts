/**
 * Document Service Layer
 * Placeholder implementations for MinIO integration
 * Easy to swap with real implementations when backend is ready
 * 
 * @module lib/services/documentService
 */

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import {
  Document,
  DocumentResponse,
  StatusResponse,
  MinioStatus,
  MinioConfig,
  ValidationResult,
  BatchUploadRequest,
  BatchUploadResponse,
  UploadProgress,
} from '@/app/dashboard/applications/nadra/components/DocumentHub/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'
const MINIO_ENDPOINT = process.env.NEXT_PUBLIC_MINIO_ENDPOINT || 'https://eu49v2.piyamtravel.com'
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || process.env.NEXT_PUBLIC_MINIO_BUCKET || 'portal-documents'

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.MINIO_ENDPOINT || MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

// Constants
const MAX_FILE_SIZE = 1500000 // 1.5 MB in bytes
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]

/**
 * Document Service Interface
 * All methods are placeholder implementations
 */
export interface DocumentService {
  // Connection & Status
  checkMinioStatus(): Promise<MinioStatus>
  pingMinioServer(endpoint: string): Promise<number>
  getMinioConfig(): Promise<MinioConfig>

  // Document Operations
  uploadDocument(
    file: File,
    familyHeadId: string,
    category?: 'receipt' | 'application-review' | 'general',
    onProgress?: (percent: number) => void
  ): Promise<Document>
  uploadMultipleDocuments(
    files: File[],
    familyHeadId: string,
    category?: 'receipt' | 'application-review' | 'general'
  ): Promise<BatchUploadResponse>
  getDocuments(familyHeadId: string): Promise<Document[]>
  deleteDocument(documentId: string): Promise<{ success: boolean }>
  downloadDocument(documentId: string): Promise<Blob>

  // Preview & Thumbnails
  generateThumbnail(document: Document): Promise<string>
  getPreviewUrl(fileName: string): Promise<string>
  getUploadUrl(fileName: string): Promise<string>

  // Validation
  validateFile(file: File): ValidationResult
  validateFileSize(file: File): ValidationResult
  validateFileMimeType(file: File): ValidationResult
}

/**
 * Placeholder Document Service Implementation
 * 
 * IMPORTANT: These are placeholder methods that simulate backend behavior
 * Replace with actual API calls when backend is ready
 */
class PlaceholderDocumentService implements DocumentService {
  /**
   * PLACEHOLDER: Check MinIO server connection status
   * In production: Will ping the MinIO endpoint and return actual status
   */
  async checkMinioStatus(): Promise<MinioStatus> {
    try {
      const startTime = performance.now()
      const response = await fetch(`${API_BASE}/documents/status`, {
        method: 'GET',
      })
      const ping = Math.round(performance.now() - startTime)
      const data = await response.json()

      if (data.success && data.status) {
        return { ...data.status, ping }
      }

      return {
        connected: false,
        ping,
        timestamp: new Date().toISOString(),
        endpoint: MINIO_ENDPOINT,
        error: data.error || 'Status check failed',
      }
    } catch (error) {
      return {
        connected: false,
        timestamp: new Date().toISOString(),
        endpoint: MINIO_ENDPOINT,
        error: error instanceof Error ? error.message : 'Failed to check MinIO status',
      }
    }
  }

  /**
   * PLACEHOLDER: Ping MinIO server
   * Returns latency in milliseconds
   */
  async pingMinioServer(endpoint: string): Promise<number> {
    const startTime = performance.now()
    try {
      await fetch(`${endpoint}/minio/health/live`, {
        method: 'GET',
        mode: 'no-cors',
      })
      return Math.round(performance.now() - startTime)
    } catch {
      return -1
    }
  }

  /**
   * PLACEHOLDER: Get MinIO configuration
   * Returns configuration from environment variables
   */
  async getMinioConfig(): Promise<MinioConfig> {
    return {
      endpoint: MINIO_ENDPOINT,
      accessKey: process.env.NEXT_PUBLIC_MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'changeme',
      bucket: MINIO_BUCKET,
      region: process.env.MINIO_REGION || 'us-east-1',
      useSSL: MINIO_ENDPOINT.startsWith('https'),
    }
  }

  /**
   * Secure Direct-to-MinIO Upload
   */
  async uploadDocument(
    file: File,
    familyHeadId: string,
    category: 'receipt' | 'application-review' | 'general' = 'general',
    onProgress?: (percent: number) => void
  ): Promise<Document> {

    // 1. Validate file size and type first
    const validation = this.validateFile(file)
    if (!validation.valid) {
      throw new Error(validation.error || 'File validation failed')
    }

    try {
      const normalizedFileType = file.type || 'application/octet-stream'

      // 2. Ask our Next.js API for a 10-minute secure upload link
      const urlResponse = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: normalizedFileType,
          familyHeadId,
          category,
        }),
      })

      const urlData = await urlResponse.json()
      if (!urlData.success || !urlData.data) {
        throw new Error(urlData.error || 'Failed to get secure upload link')
      }

      const { uploadUrl, documentId, minioKey } = urlData.data

      // 3. Upload DIRECTLY to MinIO using XHR so we get real byte-level progress.
      const etag = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', uploadUrl)
        // FORCE the browser to use the exact Content-Type we signed in the backend.
        xhr.setRequestHeader('Content-Type', normalizedFileType)

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress(Math.round((event.loaded / event.total) * 100))
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(xhr.getResponseHeader('ETag') || `unknown-${documentId}`)
          } else {
            reject(new Error(`MinIO rejected the upload (HTTP ${xhr.status})`))  
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.ontimeout = () => reject(new Error('Upload timed out'))
        xhr.send(file)
      })

      // 4. Persist metadata to Supabase
      await fetch(`${API_BASE}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          fileName: file.name,
          fileSize: file.size,
          fileType: normalizedFileType,
          category,
          familyHeadId,
          minioKey,
          minioEtag: etag,
        }),
      })

      // 5. Return the formatted Document object back to the UI
      return {
        id: documentId,
        fileName: file.name,
        fileSize: file.size,
        fileType: normalizedFileType,
        category,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'staff',
        familyHeadId,
        minio: {
          bucket: MINIO_BUCKET,
          key: minioKey,
          etag,
        },
      } as Document
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to upload document'
      )
    }
  }

  /**
   * PLACEHOLDER: Upload multiple documents
   * Handles batch uploads with progress tracking
   * Documents are stored at family level
   */
  async uploadMultipleDocuments(
    files: File[],
    familyHeadId: string,
    category: 'receipt' | 'application-review' | 'general' = 'general'
  ): Promise<BatchUploadResponse> {
    const response: BatchUploadResponse = {
      successful: [],
      failed: [],
      totalAttempted: files.length,
    }

    for (const file of files) {
      try {
        const doc = await this.uploadDocument(file, familyHeadId, category)
        response.successful.push(doc)
      } catch (error) {
        response.failed.push({
          fileName: file.name,
          fileSize: file.size,
          reason: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return response
  }

  /**
   * PLACEHOLDER: Get all documents for a family
   * Returns all documents shared by the family
   */
  async getDocuments(familyHeadId: string): Promise<Document[]> {
    try {
      const response = await fetch(
        `${API_BASE}/documents?familyHeadId=${familyHeadId}`,
        {
          method: 'GET',
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`)
      }

      const data: DocumentResponse = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch documents')
      }

      return Array.isArray(data.data) ? data.data : []
    } catch (error) {
      console.error('Error fetching documents:', error)
      return []
    }
  }

  /**
   * PLACEHOLDER: Delete a document
   */
  async deleteDocument(documentId: string): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${API_BASE}/documents/${documentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.statusText}`)
      }

      const data = await response.json()
      return { success: data.success !== false }
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to delete document'
      )
    }
  }

  /**
   * PLACEHOLDER: Download document
   * Returns the file as a Blob
   */
  async downloadDocument(documentId: string): Promise<Blob> {
    try {
      const response = await fetch(
        `${API_BASE}/documents/${documentId}/download`,
        {
          method: 'GET',
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to download document: ${response.statusText}`)
      }

      return await response.blob()
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : 'Failed to download document'
      )
    }
  }

  /**
   * PLACEHOLDER: Generate thumbnail for document
   */
  async generateThumbnail(document: Document): Promise<string> {
    // PLACEHOLDER: Return cached thumbnail URL or request generation
    if (document.preview?.thumbnail) {
      return document.preview.thumbnail
    }

    try {
      const response = await fetch(
        `${API_BASE}/documents/${document.id}/thumbnail`,
        {
          method: 'GET',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to generate thumbnail')
      }

      const data = await response.json()
      return data.thumbnailUrl || ''
    } catch (error) {
      console.error('Error generating thumbnail:', error)
      return ''
    }
  }

  /**
   * Generate a 10-minute presigned URL to VIEW a document from MinIO/S3
   */
  async getPreviewUrl(fileName: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: fileName,
    })
    return await getSignedUrl(s3Client, command, { expiresIn: 600 })
  }

  /**
   * Generate a 10-minute presigned URL to UPLOAD a document to MinIO/S3
   */
  async getUploadUrl(fileName: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: fileName,
    })
    return await getSignedUrl(s3Client, command, { expiresIn: 600 })
  }

  /**
   * Validate file against all criteria
   */
  validateFile(file: File): ValidationResult {
    // Check size
    const sizeValidation = this.validateFileSize(file)
    if (!sizeValidation.valid) {
      return sizeValidation
    }

    // Check MIME type
    const mimeValidation = this.validateFileMimeType(file)
    if (!mimeValidation.valid) {
      return mimeValidation
    }

    return { valid: true }
  }

  /**
   * Validate file size (max 1.5 MB)
   */
  validateFileSize(file: File): ValidationResult {
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      }
    }
    return { valid: true }
  }

  /**
   * Validate file MIME type
   */
  validateFileMimeType(file: File): ValidationResult {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `File type "${file.type}" is not supported. Allowed types: PDF, JPEG, PNG, WEBP, DOCX, XLSX`,
      }
    }
    return { valid: true }
  }
}

/**
 * Export singleton instance
 * Replace with actual implementation when backend is ready
 */
export const documentService = new PlaceholderDocumentService()

/**
 * Export the class for testing and injection
 */
export { PlaceholderDocumentService }
