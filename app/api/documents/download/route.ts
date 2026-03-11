import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { getS3Client } from '@/lib/s3Client'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'

/**
 * GET /api/documents/download?key=<minio-object-key>
 * Streams object bytes from MinIO with download disposition, without buffering.
 * Uses 1-year cache for immutable content-addressed objects.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    const s3Client = getS3Client()
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
      })
    )

    if (!result.Body) {
      return NextResponse.json({ error: 'File body is empty' }, { status: 404 })
    }

    // Convert AWS SDK stream to Node.js Readable stream for efficient streaming
    const stream = Readable.from(result.Body as AsyncIterable<Uint8Array>)
    const safeName = key.split('/').pop() || 'download'

    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': result.ContentType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to download file' }, { status: 500 })
  }
}
