/**
 * Document Service Layer
 *
 * Shared document operations used by the UI.
 *
 * This module is the browser-side orchestration layer for authenticated
 * document uploads, reads, deletion, and validation. It keeps feature screens
 * independent from the underlying API details.
 *
 * @module lib/services/documentService
 */

import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_MAX_FILE_SIZE_LABEL,
} from '@/lib/documentConstraints'
import {
  isCompressibleDocumentFile,
  prepareDocumentUploadFile,
} from '@/lib/services/documentCompression'
import {
  Document,
  MinioStatus,
  ValidationResult,
} from '@/app/dashboard/applications/nadra/components/DocumentHub/types'

const API_BASE = '/api'
const MINIO_ENDPOINT = process.env.NEXT_PUBLIC_MINIO_ENDPOINT || 'https://eu49v2.piyamtravel.com'
const DEFAULT_MINIO_BUCKET = 'portal-documents'
// Constants
const MAX_FILE_SIZE = DOCUMENT_MAX_FILE_SIZE_BYTES
const ALLOWED_MIME_TYPES = DOCUMENT_ALLOWED_MIME_TYPES

/**
 * Stable interface consumed by document-heavy UI surfaces.
 */
interface DocumentService {
  // Connection & Status
  checkMinioStatus(): Promise<MinioStatus>

  // Document Operations
  uploadDocument(
    file: File,
    familyHeadId: string,
    category?: 'receipt' | 'application-review' | 'general',
    onProgress?: (percent: number) => void,
  ): Promise<Document>
  getDocuments(
    familyHeadId: string,
    page?: number,
    limit?: number,
    category?: string,
  ): Promise<Document[]>
  deleteDocument(documentId: string): Promise<{ success: boolean }>

  // Validation
  validateFile(file: File): ValidationResult
  validateFileSize(file: File): ValidationResult
  validateFileMimeType(file: File): ValidationResult
}

/**
 * Browser document service implementation kept behind a narrow interface so
 * the UI is not bound directly to transport details.
 */
export class BrowserDocumentService implements DocumentService {
  /**
   * Check storage health via the server-side status endpoint.
   *
   * The server route is the source of truth because browser-side checks alone
   * cannot tell us whether the backend can actually read/write the bucket.
   */
  async checkMinioStatus(): Promise<MinioStatus> {
    try {
      const startTime = performance.now()
      const response = await fetch(`${API_BASE}/documents/status`, {
        method: 'GET',
      })
      const ping = Math.round(performance.now() - startTime)
      const data = (await response.json()) as { error?: string; status?: MinioStatus }

      const statusPayload = data?.status
      if (statusPayload) return { ...statusPayload, ping }

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
   * Upload a document through the application server.
   *
   * We intentionally route uploads through the backend fallback here because it
   * is more reliable for our current deployment shape and lets the server own
   * final persistence and metadata recording.
   */
  async uploadDocument(
    file: File,
    familyHeadId: string,
    category: 'receipt' | 'application-review' | 'general' = 'general',
    onProgress?: (percent: number) => void,
  ): Promise<Document> {
    const mimeValidation = this.validateFileMimeType(file)
    if (!mimeValidation.valid) {
      throw new Error(mimeValidation.error || 'File validation failed')
    }

    const preparedUpload = await prepareDocumentUploadFile(file)
    const uploadFile = preparedUpload.file

    // 1. Validate file size and type first
    const validation = this.validateFile(uploadFile)
    if (!validation.valid) {
      throw new Error(validation.error || 'File validation failed')
    }

    try {
      // Upload through our server as a reliable fallback when presigned PUT is
      // unstable across environments and mobile browsers.
      const uploadResult = await new Promise<{
        documentId: string
        minioKey: string
        etag: string
        storageBucket?: string
        fileName: string
        fileSize: number
        fileType: string
        category: string
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${API_BASE}/documents/upload-direct`)

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            const percent = Math.round((event.loaded / event.total) * 100)
            // Keep room for server-side MinIO write + metadata persistence.
            onProgress(Math.min(percent, 95))
          }
        }

        xhr.onload = () => {
          if (xhr.status < 200 || xhr.status >= 300) {
            try {
              const payload = JSON.parse(xhr.responseText)
              reject(new Error(payload?.error || `Upload failed (HTTP ${xhr.status})`))
            } catch {
              reject(new Error(`Upload failed (HTTP ${xhr.status})`))
            }
            return
          }

          try {
            const payload = JSON.parse(xhr.responseText)
            const result = payload?.data ?? payload
            if (!result?.documentId || !result?.minioKey) {
              reject(new Error(payload?.error || 'Upload failed'))
              return
            }

            resolve({
              documentId: result.documentId,
              minioKey: result.minioKey,
              etag: result.etag || `unknown-${result.documentId}`,
              storageBucket: result.storageBucket,
              fileName: result.fileName,
              fileSize: result.fileSize,
              fileType: result.fileType,
              category: result.category,
            })
          } catch {
            reject(new Error('Invalid upload response'))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.ontimeout = () => reject(new Error('Upload timed out'))
        xhr.timeout = 120000

        const formData = new FormData()
        formData.append('file', uploadFile)
        formData.append('familyHeadId', familyHeadId)
        formData.append('category', category)
        xhr.send(formData)
      })

      const {
        documentId,
        minioKey,
        etag,
        storageBucket,
        fileName,
        fileSize,
        fileType,
        category: storedCategory,
      } = uploadResult

      if (onProgress) onProgress(98)

      if (onProgress) onProgress(100)

      // Return the normalized document shape expected by the UI layer.
      return {
        id: documentId,
        fileName,
        fileSize,
        fileType,
        category: storedCategory,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'staff',
        familyHeadId,
        minio: {
          bucket: storageBucket || DEFAULT_MINIO_BUCKET,
          key: minioKey,
          etag,
        },
      } as Document
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to upload document')
    }
  }

  /**
   * Get documents for a family with optional pagination and category filtering
   * Supports both paginated and unpaginated responses
   */
  async getDocuments(
    familyHeadId: string,
    page: number = 1,
    limit: number = 100,
    category?: string,
  ): Promise<Document[]> {
    try {
      let url = `${API_BASE}/documents?familyHeadId=${familyHeadId}&page=${page}&limit=${limit}`
      if (category) {
        url += `&category=${encodeURIComponent(category)}`
      }
      const response = await fetch(url, {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`)
      }

      const data = (await response.json()) as {
        data?: unknown
        documents?: unknown
        error?: string
      }
      if (data?.error) throw new Error(data.error)
      const documents = data?.documents ?? data?.data
      return Array.isArray(documents) ? documents : []
    } catch (error) {
      console.error('Error fetching documents:', error)
      return []
    }
  }

  /** Delete a document through the authenticated application endpoint. */
  async deleteDocument(documentId: string): Promise<{ success: boolean }> {
    try {
      const response = await fetch(`${API_BASE}/documents/${documentId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error(`Failed to delete document: ${response.statusText}`)
      }

      const data = (await response.json()) as { error?: string }
      return { success: !data?.error }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete document')
    }
  }

  /**
   * Validate file against all criteria
   */
  validateFile(file: File): ValidationResult {
    // Check MIME type
    const mimeValidation = this.validateFileMimeType(file)
    if (!mimeValidation.valid) {
      return mimeValidation
    }

    // Check size
    const sizeValidation = this.validateFileSize(file)
    if (!sizeValidation.valid && !isCompressibleDocumentFile(file)) {
      return sizeValidation
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
        error: `File size exceeds maximum of ${DOCUMENT_MAX_FILE_SIZE_LABEL}`,
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
        error: `File type "${file.type}" is not supported. Allowed types: PDF, JPEG, PNG, WEBP`,
      }
    }
    return { valid: true }
  }
}

/** Shared browser-side document service singleton. */
export const documentService = new BrowserDocumentService()
