/**
 * Module: lib/services/documentClient.ts
 * Shared utility module for domain and infrastructure logic.
 */

import { documentService } from './documentService'

export const documentClient = {
  checkMinioStatus: documentService.checkMinioStatus.bind(documentService),
  pingMinioServer: documentService.pingMinioServer.bind(documentService),
  getMinioConfig: documentService.getMinioConfig.bind(documentService),
  uploadDocument: documentService.uploadDocument.bind(documentService),
  uploadMultipleDocuments: documentService.uploadMultipleDocuments.bind(documentService),
  getDocuments: documentService.getDocuments.bind(documentService),
  deleteDocument: documentService.deleteDocument.bind(documentService),
  downloadDocument: documentService.downloadDocument.bind(documentService),
  generateThumbnail: documentService.generateThumbnail.bind(documentService),
  validateFile: documentService.validateFile.bind(documentService),
  validateFileSize: documentService.validateFileSize.bind(documentService),
  validateFileMimeType: documentService.validateFileMimeType.bind(documentService),
}
