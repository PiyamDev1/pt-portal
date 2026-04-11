/**
 * Document Service Layer
 * Placeholder implementations for MinIO integration
 * Easy to swap with real implementations when backend is ready
 *
 * @module lib/services/documentService
 */

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getS3Client } from '@/lib/s3Client'
import {
  Document,
  MinioStatus,
  MinioConfig,
  ValidationResult,
  BatchUploadResponse,
} from '@/app/dashboard/applications/nadra/components/DocumentHub/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api'
const MINIO_ENDPOINT = process.env.NEXT_PUBLIC_MINIO_ENDPOINT || 'https://eu49v2.piyamtravel.com'
const MINIO_BUCKET =
  process.env.MINIO_BUCKET_NAME || process.env.NEXT_PUBLIC_MINIO_BUCKET || 'portal-documents'
const MINIO_REGION = process.env.MINIO_REGION || 'eu-west-1'

// Constants
const MAX_FILE_SIZE = 1500000 // 1.5 MB in bytes
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']

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
    onProgress?: (percent: number) => void,
  ): Promise<Document>
  uploadMultipleDocuments(
    files: File[],
    familyHeadId: string,
    category?: 'receipt' | 'application-review' | 'general',
  ): Promise<BatchUploadResponse>
  getDocuments(
    familyHeadId: string,
    page?: number,
    limit?: number,
    category?: string,
  ): Promise<Document[]>
  deleteDocument(documentId: string): Promise<{ success: boolean }>
  downloadDocument(documentId: string): Promise<Blob>

  // Preview & Thumbnails
  generateThumbnail(document: Document): Promise<string>
  getPreviewUrl(fileName: string): Promise<string>

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
  private getServerS3Client(): S3Client {
    if (typeof window !== 'undefined') {
      throw new Error('Signed URL generation is server-only')
    }

    // Reuse the shared MinIO/S3 client so signing and direct object reads
    // always use identical endpoint/region/credentials.
    return getS3Client()
  }

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
      secretKey: '***',
      bucket: MINIO_BUCKET,
      region: MINIO_REGION,
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
    onProgress?: (percent: number) => void,
  ): Promise<Document> {
    // 1. Validate file size and type first
    const validation = this.validateFile(file)
    if (!validation.valid) {
      throw new Error(validation.error || 'File validation failed')
    }

    try {
      // Guarantee we have a type to send
      const safeFileType = file.type || 'application/octet-stream'

      // 2. Upload through our server as a reliable fallback when presigned PUT is unstable.
      const uploadResult = await new Promise<{
        documentId: string
        minioKey: string
        etag: string
        storageBucket?: string
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
            reject(new Error(`Upload failed (HTTP ${xhr.status})`))
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
            })
          } catch {
            reject(new Error('Invalid upload response'))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.ontimeout = () => reject(new Error('Upload timed out'))
        xhr.timeout = 120000

        const formData = new FormData()
        formData.append('file', file)
        formData.append('familyHeadId', familyHeadId)
        formData.append('category', category)
        xhr.send(formData)
      })

      const { documentId, minioKey, etag, storageBucket } = uploadResult

      if (onProgress) onProgress(98)

      // 4. Persist metadata to Supabase
      await fetch(`${API_BASE}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          fileName: file.name,
          fileSize: file.size,
          fileType: safeFileType,
          category,
          familyHeadId,
          minioKey,
          minioEtag: etag,
          storageBucket,
        }),
      })

      if (onProgress) onProgress(100)

      // 5. Return the formatted Document object back to the UI
      return {
        id: documentId,
        fileName: file.name,
        fileSize: file.size,
        fileType: safeFileType,
        category,
        uploadedAt: new Date().toISOString(),
        uploadedBy: 'staff',
        familyHeadId,
        minio: {
          bucket: storageBucket || MINIO_BUCKET,
          key: minioKey,
          etag,
        },
      } as Document
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to upload document')
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
    category: 'receipt' | 'application-review' | 'general' = 'general',
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

      const data: any = await response.json()
      if (data?.error) throw new Error(data.error)
      const documents = data?.documents ?? data?.data
      return Array.isArray(documents) ? documents : []
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
      return { success: !data?.error }
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to delete document')
    }
  }

  /**
   * PLACEHOLDER: Download document
   * Returns the file as a Blob
   */
  async downloadDocument(documentId: string): Promise<Blob> {
    try {
      const response = await fetch(`${API_BASE}/documents/${documentId}/download`, {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`Failed to download document: ${response.statusText}`)
      }

      return await response.blob()
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : 'Failed to download document')
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
      const response = await fetch(`${API_BASE}/documents/${document.id}/thumbnail`, {
        method: 'GET',
      })

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
    const s3Client = this.getServerS3Client()
    const command = new GetObjectCommand({
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
