import { NextRequest, NextResponse } from 'next/server'
import { documentService } from '@/lib/services/documentService'

/**
 * GET /api/documents/[documentId]/thumbnail
 * Returns a 10-minute presigned URL for the document's thumbnail object in MinIO.
 * The thumbnail key is expected to follow the pattern: thumbnails/{documentId}
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

    const thumbnailUrl = await documentService.getPreviewUrl(`thumbnails/${documentId}`)
    return NextResponse.json({ thumbnailUrl })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to generate thumbnail link' }, { status: 500 })
  }
}
