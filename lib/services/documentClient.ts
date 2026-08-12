/**
 * Module: lib/services/documentClient.ts
 * Shared utility module for domain and infrastructure logic.
 */

import { documentService } from './documentService'

export const documentClient = {
  checkMinioStatus: documentService.checkMinioStatus.bind(documentService),
  uploadDocument: documentService.uploadDocument.bind(documentService),
  getDocuments: documentService.getDocuments.bind(documentService),
  deleteDocument: documentService.deleteDocument.bind(documentService),
  validateFile: documentService.validateFile.bind(documentService),
  validateFileSize: documentService.validateFileSize.bind(documentService),
  validateFileMimeType: documentService.validateFileMimeType.bind(documentService),
}
