/**
 * R2 to MinIO Document Migration
 * Transfers documents from Cloudflare R2 to local MinIO storage
 * Handles single file and batch migrations with event logging
 * Used for storage failover and capacity management
 * 
 * @module lib/r2Migration
 */

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import {
  recordMigrationAttempt,
  recordMigrationBatch,
  recordMigrationFailure,
  recordMigrationSuccess,
} from '@/lib/documentMigrationMetrics'
import {
  MigrationTrigger,
  recordPersistentMigrationAttempt,
  recordPersistentMigrationBatch,
  recordPersistentMigrationFailure,
  recordPersistentMigrationSuccess,
} from '@/lib/documentMigrationStore'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getS3Client } from '@/lib/s3Client'
import { getSupabaseClient } from '@/lib/supabaseClient'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

type DocumentKeyRow = {
  minio_key: string | null
}

/**
 * Migrate a single object from R2 to MinIO, then delete from R2.
 * Database metadata is updated only after transfer + delete succeed.
 */
export async function migrateObjectFromR2ToMinio(
  key: string,
  options?: { trigger?: MigrationTrigger },
): Promise<boolean> {
  if (!isR2Configured()) return false
  const trigger = options?.trigger || 'unknown'

  try {
    recordMigrationAttempt()
    void recordPersistentMigrationAttempt(key, trigger)
    const r2Client = getR2Client()
    const minioClient = getS3Client()

    const r2Object = await r2Client.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      }),
    )

    if (!r2Object.Body) return false

    const putResult = await minioClient.send(
      new PutObjectCommand({
        Bucket: MINIO_BUCKET,
        Key: key,
        Body: r2Object.Body,
        ContentType: r2Object.ContentType || 'application/octet-stream',
      }),
    )

    // Only after successful copy, remove temporary object from fallback.
    await r2Client.send(
      new DeleteObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
      }),
    )

    const supabase = getSupabaseClient()
    await supabase
      .from('documents')
      .update({
        minio_bucket: MINIO_BUCKET,
        minio_etag: putResult.ETag || '',
      })
      .eq('minio_key', key)
      .eq('deleted', false)

    recordMigrationSuccess(key)
    void recordPersistentMigrationSuccess(key, trigger)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed'
    recordMigrationFailure(key, message)
    void recordPersistentMigrationFailure(key, trigger, message)
    return false
  }
}

/**
 * Migrate a small batch of fallback objects back to MinIO.
 */
export async function migrateFallbackBatch(
  limit: number = 5,
  options?: { trigger?: MigrationTrigger },
): Promise<{ attempted: number; migrated: number }> {
  if (!isR2Configured()) return { attempted: 0, migrated: 0 }
  const trigger = options?.trigger || 'unknown'

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('documents')
    .select('minio_key')
    .eq('deleted', false)
    .eq('minio_bucket', R2_BUCKET)
    .limit(Math.max(1, Math.min(50, limit)))

  if (error || !Array.isArray(data) || data.length === 0) {
    return { attempted: 0, migrated: 0 }
  }

  let migrated = 0
  for (const row of data as DocumentKeyRow[]) {
    const key = String(row.minio_key || '')
    if (!key) continue
    const ok = await migrateObjectFromR2ToMinio(key, { trigger })
    if (ok) migrated += 1
  }

  recordMigrationBatch(data.length, migrated)
  void recordPersistentMigrationBatch(data.length, migrated, trigger)
  return { attempted: data.length, migrated }
}
