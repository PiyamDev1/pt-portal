import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Readable } from 'stream'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { migrateObjectFromR2ToMinio } from '@/lib/r2Migration'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

/**
 * GET /api/documents/preview?key=<minio-object-key>
 * Streams the object directly from MinIO to the browser without buffering.
 * Uses 1-year cache for immutable content-addressed objects.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    let result

    try {
      const s3Client = getS3Client()
      result = await s3Client.send(
        new GetObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: key,
        })
      )
    } catch (minioReadError) {
      if (!isR2Configured()) {
        throw minioReadError
      }

      const r2Client = getR2Client()
      result = await r2Client.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
        })
      )

      // Try to move object back to MinIO for future reads
      void migrateObjectFromR2ToMinio(key, { trigger: 'read' })
    }

    if (!result.Body) {
      return NextResponse.json({ error: 'File body is empty' }, { status: 404 })
    }

    // Convert AWS SDK stream to Node.js Readable stream for efficient streaming
    const stream = Readable.from(result.Body as AsyncIterable<Uint8Array>)
    
    return new NextResponse(stream as any, {
      headers: {
        'Content-Type': result.ContentType || 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to stream preview file' }, { status: 500 })
  }
}
