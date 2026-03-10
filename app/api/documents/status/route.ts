import { NextRequest, NextResponse } from 'next/server'
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3'

const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.MINIO_ENDPOINT,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true,
})

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'https://eu49v2.piyamtravel.com'
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'

/**
 * GET /api/documents/status
 * Authenticated check using HeadBucketCommand — verifies the bucket is reachable
 * with real credentials rather than an unauthenticated health ping.
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now()

  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }))

    const ping = Math.round(performance.now() - startTime)
    return NextResponse.json({
      success: true,
      status: {
        connected: true,
        ping,
        timestamp: new Date().toISOString(),
        endpoint: MINIO_ENDPOINT,
      },
    })
  } catch (error) {
    const ping = Math.round(performance.now() - startTime)
    return NextResponse.json({
      success: true,
      status: {
        connected: false,
        ping,
        timestamp: new Date().toISOString(),
        endpoint: MINIO_ENDPOINT,
        error: error instanceof Error ? error.message : 'Connection failed',
      },
    })
  }
}
