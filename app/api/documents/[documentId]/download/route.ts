/**
 * Module: app/api/documents/[documentId]/download/route.ts
 * API route or server helper for documents/[documentId]/download/route.ts.
 */

import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/http'
import { getSignedDocumentPreviewUrl } from '@/lib/services/documentServer'

/**
 * GET /api/documents/[documentId]/download
 * Redirects the browser to a 10-minute presigned download URL from MinIO.
 * The file is streamed directly from MinIO — zero bandwidth on this server.
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
    return NextResponse.redirect(url)
  } catch (error) {
    return apiError('Failed to generate download link', 500)
  }
}
