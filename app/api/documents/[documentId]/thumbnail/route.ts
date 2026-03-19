import { NextRequest } from 'next/server'
import { apiOk, apiError } from '@/lib/api/http'
import { getSignedDocumentPreviewUrl } from '@/lib/services/documentServer'

/**
 * GET /api/documents/[documentId]/thumbnail
 * Returns a 10-minute presigned URL for the document's thumbnail object in MinIO.
 * The thumbnail key is expected to follow the pattern: thumbnails/{documentId}
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const { documentId } = await params

    if (!documentId) {
      return apiError('documentId is required', 400)
    }

    const thumbnailUrl = await getSignedDocumentPreviewUrl(`thumbnails/${documentId}`)
    return apiOk({ thumbnailUrl })
  } catch (error) {
    return apiError('Failed to generate thumbnail link', 500)
  }
}
