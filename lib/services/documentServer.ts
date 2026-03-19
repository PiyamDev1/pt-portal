/**
 * Module: lib/services/documentServer.ts
 * Shared utility module for domain and infrastructure logic.
 */

import { documentService } from './documentService'

export async function getSignedDocumentPreviewUrl(key: string): Promise<string> {
  if (!key) throw new Error('Document key is required')
  return documentService.getPreviewUrl(key)
}
