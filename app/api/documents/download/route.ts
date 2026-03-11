import { NextRequest, NextResponse } from 'next/server'
import { documentService } from '@/lib/services/documentService'

/**
 * GET /api/documents/download?key=<minio-object-key>
 * Redirects the browser to a 10-minute presigned download URL from MinIO.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    const url = await documentService.getPreviewUrl(key)
    return NextResponse.redirect(url)
  } catch {
    return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
  }
}
