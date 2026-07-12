import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireSuperAdminSession } from '@/lib/adminSessionAuth'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { getS3Client } from '@/lib/s3Client'
import {
  getPackageBackupStorageClient,
  getPackageBackupStorageConfig,
} from '@/lib/packageIntegrations'

export const maxDuration = 300

export async function GET() {
  const auth = await requireSuperAdminSession()
  if (!auth.authorized) return auth.response
  const supabase = getServiceSupabaseClient()
  const [pending, failed, copied] = await Promise.all([
    supabase
      .from('travel_package_documents')
      .select('id', { count: 'exact', head: true })
      .eq('backup_status', 'pending'),
    supabase
      .from('travel_package_documents')
      .select('id', { count: 'exact', head: true })
      .eq('backup_status', 'failed'),
    supabase
      .from('travel_package_documents')
      .select('id', { count: 'exact', head: true })
      .eq('backup_status', 'copied'),
  ])
  return apiOk({
    configured: Boolean(getPackageBackupStorageConfig()),
    pending: pending.count || 0,
    failed: failed.count || 0,
    copied: copied.count || 0,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdminSession()
  if (!auth.authorized) return auth.response
  const config = getPackageBackupStorageConfig()
  if (!config) return apiError('R3 package backup storage is not configured', 503)
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const limit = Math.max(1, Math.min(100, Number(body.limit || 25)))
  const supabase = getServiceSupabaseClient()
  const { data: documents, error } = await supabase
    .from('travel_package_documents')
    .select('id, storage_bucket, storage_key, file_type')
    .in('backup_status', ['pending', 'failed'])
    .neq('status', 'deleted')
    .order('updated_at', { ascending: true })
    .limit(limit)
  if (error) return apiError(error.message || 'Failed to load documents needing backup', 500)

  const results: Array<{ id: string; status: 'copied' | 'failed'; error?: string }> = []
  for (const document of documents || []) {
    try {
      const source = await getS3Client().send(
        new GetObjectCommand({
          Bucket: document.storage_bucket,
          Key: document.storage_key,
        }),
      )
      if (!source.Body) throw new Error('Primary object body is empty')
      const bytes = await source.Body.transformToByteArray()
      await getPackageBackupStorageClient().send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: document.storage_key,
          Body: bytes,
          ContentType: document.file_type || source.ContentType || 'application/octet-stream',
        }),
      )
      await supabase
        .from('travel_package_documents')
        .update({
          backup_provider: 'r3',
          backup_bucket: config.bucketName,
          backup_key: document.storage_key,
          backup_status: 'copied',
          backup_error: null,
        })
        .eq('id', document.id)
      results.push({ id: document.id, status: 'copied' })
    } catch (copyError) {
      const message = copyError instanceof Error ? copyError.message : 'Backup copy failed'
      await supabase
        .from('travel_package_documents')
        .update({
          backup_provider: 'r3',
          backup_bucket: config.bucketName,
          backup_key: document.storage_key,
          backup_status: 'failed',
          backup_error: message,
        })
        .eq('id', document.id)
      results.push({ id: document.id, status: 'failed', error: message })
    }
  }
  return apiOk({
    processed: results.length,
    copied: results.filter((result) => result.status === 'copied').length,
    failed: results.filter((result) => result.status === 'failed').length,
    results,
  })
}
