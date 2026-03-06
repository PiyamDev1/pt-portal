/**
 * Document Management Types for MinIO Integration
 * @module DocumentHub/types
 */

/**
 * Represents a single document stored in MinIO
 * Documents are stored at the family level and shared by all applicants in the family
 */
export interface Document {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  category?: 'receipt' | 'application-review' | 'general';
  uploadedAt: string;
  uploadedBy: string;
  familyHeadId: string; // Family-level storage - shared by all applicants
  minio: {
    bucket: string;
    key: string;
    etag: string;
  };
  preview?: {
    thumbnail?: string;
    previewUrl?: string;
  };
  deleted?: boolean;
}

/**
 * MinIO server configuration
 */
export interface MinioConfig {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  useSSL: boolean;
}

/**
 * Real-time progress of a file upload
 */
export interface UploadProgress {
  fileId: string;
  fileName: string;
  progress: number; // 0-100
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  uploadedBytes?: number;
  totalBytes?: number;
}

/**
 * Connection status to MinIO server
 */
export interface MinioStatus {
  connected: boolean;
  ping?: number; // latency in milliseconds
  timestamp: string;
  endpoint: string;
  error?: string;
}

/**
 * Response from server for document operations
 */
export interface DocumentResponse {
  success: boolean;
  data?: Document | Document[];
  message?: string;
  error?: string;
}

/**
 * Response for status check
 */
export interface StatusResponse {
  success: boolean;
  status?: MinioStatus;
  error?: string;
}

/**
 * File validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  details?: {
    fieldName: string;
    message: string;
  }[];
}

/**
 * Document category for organization
 */
export interface DocumentCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/**
 * Applicant information for document context
 */
export interface ApplicantInfo {
  id: string;
  firstName: string;
  lastName: string;
  citizenNumber: string;
  email?: string;
  phoneNumber?: string;
}

/**
 * Batch upload request
 */
export interface BatchUploadRequest {
  files: File[];
  familyHeadId: string;
  category?: 'receipt' | 'application-review' | 'general';
  metadata?: Record<string, string>;
}

/**
 * Batch upload response
 */
export interface BatchUploadResponse {
  successful: Document[];
  failed: FailedUpload[];
  totalAttempted: number;
}

/**
 * Information about a failed upload
 */
export interface FailedUpload {
  fileName: string;
  reason: string;
  fileSize?: number;
}

/**
 * Document preview data
 */
export interface DocumentPreview {
  documentId: string;
  fileType: string;
  previewUrl: string;
  thumbnailUrl?: string;
  canZoom: boolean;
  pageCount?: number; // for PDFs
}
