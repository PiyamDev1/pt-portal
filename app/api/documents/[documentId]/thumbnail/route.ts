/**
 * Module: app/api/documents/[documentId]/thumbnail/route.ts
 * API route or server helper for documents/[documentId]/thumbnail/route.ts.
 */

import { NextRequest } from 'next/server'
import { apiOk, apiError } from '@/lib/api/http'
import { getSignedDocumentThumbnailUrl } from '@/lib/services/documentServer'
import { requireStaffSession } from '@/lib/auth/staffSession'

/**
 * GET /api/documents/[documentId]/thumbnail
 * Returns a 10-minute presigned URL for the document's thumbnail object in MinIO.
 * The thumbnail key is expected to follow the pattern: thumbnails/{documentId}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { documentId } = await params

    if (!documentId) {
      return apiError('documentId is required', 400)
    }

    const thumbnailUrl = await getSignedDocumentThumbnailUrl(documentId)
    return apiOk({ thumbnailUrl }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Document not found') {
      return apiError('Document not found', 404)
    }
    return apiError('Failed to generate thumbnail link', 500)
  }
}
