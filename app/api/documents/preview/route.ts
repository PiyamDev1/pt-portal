import { NextRequest, NextResponse } from 'next/server'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: 'eu-west-1',
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'

/**
 * GET /api/documents/preview?key=<minio-object-key>
 * Streams the object directly from MinIO to the browser.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')

    if (!key) {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }

    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
      })
    )

    if (!result.Body) {
      return NextResponse.json({ error: 'File body is empty' }, { status: 404 })
    }

    const bytes = await result.Body.transformToByteArray()
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': result.ContentType || 'application/octet-stream',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to stream preview file' }, { status: 500 })
  }
}
