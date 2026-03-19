/**
 * DocumentHub Components
 * Main export file for all document management components
 *
 * @module DocumentHub/index
 */

export { DocumentHub } from './page'
export { DocumentUpload } from './DocumentUpload'
export { DocumentGrid } from './DocumentGrid'
export { DocumentPreview } from './DocumentPreview'
export { MinioStatus } from './MinioStatus'
export type {
  Document,
  DocumentResponse,
  StatusResponse,
  MinioStatus as MinioStatusType,
  MinioConfig,
  UploadProgress,
  ValidationResult,
  BatchUploadRequest,
  BatchUploadResponse,
  FailedUpload,
  DocumentPreview as DocumentPreviewType,
  ApplicantInfo,
  DocumentCategory,
} from './types'

export { default as DocumentHubDefault } from './page'
