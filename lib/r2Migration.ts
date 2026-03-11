import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getS3Client } from '@/lib/s3Client'
import { getSupabaseClient } from '@/lib/supabaseClient'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

/**
 * Migrate a single object from R2 to MinIO, then delete from R2.
 * Database metadata is updated only after transfer + delete succeed.
 */
export async function migrateObjectFromR2ToMinio(key: string): Promise<boolean> {
  if (!isR2Configured()) return false

  try {
    const r2Client = getR2Client()
    const minioClient = getS3Client()

    const r2Object = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      })
    )

    if (!r2Object.Body) return false

    const bytes = await r2Object.Body.transformToByteArray()
    const putResult = await minioClient.send(
      new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
        Body: Buffer.from(bytes),
        ContentType: r2Object.ContentType || 'application/octet-stream',
      })
    )

    // Only after successful copy, remove temporary object from fallback.
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      })
    )

    const supabase = getSupabaseClient()
    await (supabase.from('documents') as any)
      .update({
        minio_bucket: MINIO_BUCKET,
        minio_etag: putResult.ETag || '',
      })
      .eq('minio_key', key)
      .eq('deleted', false)

    return true
  } catch {
    return false
  }
}

/**
 * Migrate a small batch of fallback objects back to MinIO.
 */
export async function migrateFallbackBatch(limit: number = 5): Promise<{ attempted: number; migrated: number }> {
  if (!isR2Configured()) return { attempted: 0, migrated: 0 }

  const supabase = getSupabaseClient()
  const { data, error } = await (supabase.from('documents') as any)
    .select('minio_key')
    .eq('deleted', false)
    .eq('minio_bucket', R2_BUCKET)
    .limit(Math.max(1, Math.min(50, limit)))

  if (error || !Array.isArray(data) || data.length === 0) {
    return { attempted: 0, migrated: 0 }
  }

  let migrated = 0
  for (const row of data) {
    const key = String(row.minio_key || '')
    if (!key) continue
    const ok = await migrateObjectFromR2ToMinio(key)
    if (ok) migrated += 1
  }

  return { attempted: data.length, migrated }
}
