/**
 * Module: app/api/documents/[documentId]/preview/route.ts
 * API route or server helper for documents/[documentId]/preview/route.ts.
 */

import { NextRequest } from 'next/server'
import { getSignedDocumentPreviewUrl } from '@/lib/services/documentServer'
import { apiOk, apiError } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'

/**
 * GET /api/documents/[documentId]/preview
 * Returns a 10-minute presigned URL to view the document directly from MinIO.
 * The file never passes through this server.
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

    const url = await getSignedDocumentPreviewUrl(documentId)
    return apiOk({ url }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    if (error instanceof Error && error.message === 'Document not found') {
      return apiError('Document not found', 404)
    }
    return apiError('Failed to generate preview link', 500)
  }
}
