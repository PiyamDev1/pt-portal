import { NextRequest, NextResponse } from 'next/server'
import { documentService } from '@/lib/services/documentService'

/**
 * GET /api/documents/[documentId]/download
 * Redirects the browser to a 10-minute presigned download URL from MinIO.
 * The file is streamed directly from MinIO — zero bandwidth on this server.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const { documentId } = await params

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
    }

    const url = await documentService.getPreviewUrl(documentId)
    return NextResponse.redirect(url)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
  }
}
