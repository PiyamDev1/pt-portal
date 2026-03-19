import { NextRequest, NextResponse } from 'next/server'
import { getSignedDocumentPreviewUrl } from '@/lib/services/documentServer'
import { apiOk, apiError } from '@/lib/api/http'

/**
 * GET /api/documents/[documentId]/preview
 * Returns a 10-minute presigned URL to view the document directly from MinIO.
 * The file never passes through this server.
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

    const url = await getSignedDocumentPreviewUrl(documentId)
    return apiOk({ url })
  } catch (error) {
    return apiError('Failed to generate preview link', 500)
  }
}
