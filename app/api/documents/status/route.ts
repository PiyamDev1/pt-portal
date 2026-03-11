import { NextRequest, NextResponse } from 'next/server'
import { HeadBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '@/lib/s3Client'

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'https://eu49v2.piyamtravel.com'
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'

/**
 * Ensure the bucket has a CORS policy that allows direct browser PUT uploads.
 * This runs server-side using our credentials — the browser never touches MinIO auth.
 */
async function ensureCorsPolicy() {
  try {
    const s3Client = getS3Client()
    await s3Client.send(
      new PutBucketCorsCommand({
        Bucket: MINIO_BUCKET,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: ['*'],
              AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
              AllowedHeaders: ['*'],
              ExposeHeaders: ['ETag', 'Content-Length'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
    )
  } catch {
    // Non-fatal — the bucket may already have CORS configured
  }
}

/**
 * GET /api/documents/status
 * Authenticated check using HeadBucketCommand — verifies the bucket is reachable.
 * Also ensures CORS is configured so direct browser PUT uploads can succeed.
 */
export async function GET(request: NextRequest) {
  const startTime = performance.now()

  try {
    const s3Client = getS3Client()
    await s3Client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET }))

    // Best-effort CORS setup on every status check — fast and idempotent
    await ensureCorsPolicy()

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
    const errorMessage =
      error && typeof error === 'object' && 'name' in error && 'message' in error
        ? `${String((error as { name?: string }).name || 'Error')}: ${String((error as { message?: string }).message || 'Connection failed')}`
        : 'Connection failed'

    return NextResponse.json({
      success: true,
      status: {
        connected: false,
        ping,
        timestamp: new Date().toISOString(),
        endpoint: MINIO_ENDPOINT,
        error: errorMessage,
      },
    })
  }
}
