import { NextRequest, NextResponse } from 'next/server'
import { HeadBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'https://eu49v2.piyamtravel.com'
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_ENDPOINT = process.env.R2_ENDPOINT || ''
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const STATUS_TIMEOUT_MS = 2500

type ProbeResult = {
  connected: boolean
  ping: number | null
  error?: string
}

async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutRef: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutRef = setTimeout(() => reject(new Error('Timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutRef) clearTimeout(timeoutRef)
  }
}

async function probeMinio(): Promise<ProbeResult> {
  const start = performance.now()
  try {
    const s3Client = getS3Client()
    await runWithTimeout(
      s3Client.send(new HeadBucketCommand({ Bucket: MINIO_BUCKET })),
      STATUS_TIMEOUT_MS
    )
    return { connected: true, ping: Math.round(performance.now() - start) }
  } catch (error) {
    return {
      connected: false,
      ping: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Connection failed',
    }
  }
}

async function probeR2(): Promise<ProbeResult> {
  if (!isR2Configured()) {
    return { connected: false, ping: null, error: 'R2 not configured' }
  }

  const start = performance.now()
  try {
    const r2Client = getR2Client()
    await runWithTimeout(
      r2Client.send(new HeadBucketCommand({ Bucket: R2_BUCKET })),
      STATUS_TIMEOUT_MS
    )
    return { connected: true, ping: Math.round(performance.now() - start) }
  } catch (error) {
    return {
      connected: false,
      ping: Math.round(performance.now() - start),
      error: error instanceof Error ? error.message : 'Fallback connection failed',
    }
  }
}

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
  const [minio, r2] = await Promise.all([probeMinio(), probeR2()])

  // Keep this non-blocking so status remains fast even if CORS update is slow.
  if (minio.connected) {
    void ensureCorsPolicy()
  }

  const uploadAvailable = minio.connected || r2.connected
  const previewDownloadAvailable = minio.connected
  const uploadOnlyFallback = !minio.connected && r2.connected

  return NextResponse.json({
    success: true,
    status: {
      connected: minio.connected,
      ping: minio.ping,
      timestamp: new Date().toISOString(),
      endpoint: MINIO_ENDPOINT,
      mode: minio.connected
        ? 'primary'
        : uploadOnlyFallback
          ? 'fallback-upload-only'
          : 'offline',
      fallback: {
        configured: isR2Configured(),
        connected: r2.connected,
        endpoint: R2_ENDPOINT || null,
        bucket: R2_BUCKET,
        ping: r2.ping,
        error: r2.error,
      },
      capabilities: {
        upload: uploadAvailable,
        previewDownload: previewDownloadAvailable,
        uploadOnlyFallback,
      },
      error: minio.connected ? undefined : minio.error,
    },
  })
}
