import { HeadBucketCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3'
import { migrateFallbackBatch } from '@/lib/r2Migration'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getS3Client } from '@/lib/s3Client'

const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || 'https://eu49v2.piyamtravel.com'
const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_ENDPOINT = process.env.R2_ENDPOINT || ''
const R2_DISPLAY_ENDPOINT = process.env.R2_PING_URL || process.env.R2_ENDPOINT || ''
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const STATUS_TIMEOUT_MS = 2500

export type ProbeResult = {
  connected: boolean
  ping: number | null
  error?: string
}

export async function runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
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

export async function probeMinio(): Promise<ProbeResult> {
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

export async function probeR2(): Promise<ProbeResult> {
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
    // Non-fatal — the bucket may already have CORS configured.
  }
}

export async function getDocumentStorageStatus(options?: { runMaintenance?: boolean }) {
  const runMaintenance = options?.runMaintenance ?? true
  const [minio, r2] = await Promise.all([probeMinio(), probeR2()])

  if (runMaintenance && minio.connected) {
    void ensureCorsPolicy()
  }

  if (runMaintenance && minio.connected && r2.connected) {
    void migrateFallbackBatch(5, { trigger: 'status' })
  }

  const uploadAvailable = minio.connected || r2.connected
  const previewDownloadAvailable = minio.connected
  const uploadOnlyFallback = !minio.connected && r2.connected

  return {
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
      endpoint: R2_DISPLAY_ENDPOINT || R2_ENDPOINT || null,
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
  }
}

export function getDocumentStorageConstants() {
  return {
    MINIO_BUCKET,
    R2_BUCKET,
  }
}