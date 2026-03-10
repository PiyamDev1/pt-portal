import { NextRequest, NextResponse } from 'next/server'
import { documentService } from '@/lib/services/documentService'

/**
 * GET /api/documents/[documentId]/preview
 * Returns a 10-minute presigned URL to view the document directly from MinIO.
 * The file never passes through this server.
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
    return NextResponse.json({ url })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate preview link' }, { status: 500 })
  }
}
