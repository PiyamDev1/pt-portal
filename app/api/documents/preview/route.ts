import { NextRequest, NextResponse } from 'next/server'
import { documentService } from '@/lib/services/documentService'

/**
 * GET /api/documents/preview?key=<minio-object-key>
 * Returns a 10-minute presigned URL to view the document directly from MinIO.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    const url = await documentService.getPreviewUrl(key)
    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ error: 'Failed to generate preview link' }, { status: 500 })
  }
}
