/**
 * Module: app/api/documents/[documentId]/download/route.ts
 * API route or server helper for documents/[documentId]/download/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/http'
import { getSignedDocumentDownloadUrl } from '@/lib/services/documentServer'
import { requireStaffSession } from '@/lib/auth/staffSession'

/**
 * GET /api/documents/[documentId]/download
 * Redirects the browser to a 10-minute presigned download URL from MinIO.
 * The file is streamed directly from MinIO — zero bandwidth on this server.
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

    const url = await getSignedDocumentDownloadUrl(documentId)
    const response = NextResponse.redirect(url)
    response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    return response
  } catch (error) {
    if (error instanceof Error && error.message === 'Document not found') {
      return apiError('Document not found', 404)
    }
    return apiError('Failed to generate download link', 500)
  }
}
