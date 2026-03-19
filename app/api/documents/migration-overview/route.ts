import { NextRequest } from 'next/server'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { getDocumentMigrationMetrics } from '@/lib/documentMigrationMetrics'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { getPersistentMigrationEvents } from '@/lib/documentMigrationStore'
import { getDocumentStorageConstants, getDocumentStorageStatus } from '@/lib/documentStorageStatus'
import { migrateFallbackBatch } from '@/lib/r2Migration'
import { getSupabaseClient } from '@/lib/supabaseClient'

function calculateConsecutiveFailures(events: Array<{ outcome?: string }>) {
  let count = 0
  for (const event of events) {
    if (event.outcome === 'failure') {
      count += 1
      continue
    }
    break
  }
  return count
}

async function getOverview() {
  const { MINIO_BUCKET, R2_BUCKET } = getDocumentStorageConstants()
  const supabase = getSupabaseClient()
  const [
    totalActiveResult,
    primaryResult,
    fallbackResult,
    deletedResult,
    recentFallbackResult,
    oldestFallbackResult,
    health,
    persistentEvents,
  ] = await Promise.all([
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('deleted', false),
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('deleted', false)
      .eq('minio_bucket', MINIO_BUCKET),
    supabase
      .from('documents')
      .select('id', { count: 'exact', head: true })
      .eq('deleted', false)
      .eq('minio_bucket', R2_BUCKET),
    supabase.from('documents').select('id', { count: 'exact', head: true }).eq('deleted', true),
    supabase
      .from('documents')
      .select('id, file_name, file_size, category, uploaded_at, family_head_id, minio_key')
      .eq('deleted', false)
      .eq('minio_bucket', R2_BUCKET)
      .order('uploaded_at', { ascending: false })
      .limit(10),
    supabase
      .from('documents')
      .select('uploaded_at')
      .eq('deleted', false)
      .eq('minio_bucket', R2_BUCKET)
      .order('uploaded_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    getDocumentStorageStatus({ runMaintenance: false }),
    getPersistentMigrationEvents(30),
  ])

  const oldestFallbackAt = oldestFallbackResult?.data?.uploaded_at || null
  const backlogAgeHours = oldestFallbackAt
    ? Math.round(((Date.now() - new Date(oldestFallbackAt).getTime()) / 36e5) * 10) / 10
    : 0

  const inMemoryMetrics = getDocumentMigrationMetrics()
  const fallbackEvents = inMemoryMetrics.recentEvents.map((event, index) => ({
    id: `memory-${index}`,
    event_type: event.outcome === 'success' ? 'success' : 'failure',
    outcome: event.outcome,
    object_key: event.key,
    attempted: null,
    migrated: null,
    trigger_source: 'memory',
    error_message: event.error || null,
    created_at: event.timestamp,
  }))
  const mergedEvents = persistentEvents.length > 0 ? persistentEvents : fallbackEvents
  const consecutiveFailures = calculateConsecutiveFailures(mergedEvents)

  const alerts: Array<{
    severity: 'info' | 'warning' | 'critical'
    title: string
    message: string
  }> = []
  if ((fallbackResult.count || 0) > 20) {
    alerts.push({
      severity: 'warning',
      title: 'Fallback backlog is growing',
      message: `${fallbackResult.count || 0} documents are still waiting to migrate back to primary storage.`,
    })
  }
  if (backlogAgeHours > 6) {
    alerts.push({
      severity: 'warning',
      title: 'Backlog age threshold exceeded',
      message: `Oldest fallback document has been pending for ${backlogAgeHours} hours.`,
    })
  }
  if (consecutiveFailures >= 3) {
    alerts.push({
      severity: 'critical',
      title: 'Consecutive migration failures detected',
      message: `${consecutiveFailures} failures in a row were recorded. Check storage credentials and connectivity.`,
    })
  }

  return {
    summary: {
      totalActiveDocuments: totalActiveResult.count || 0,
      primaryDocuments: primaryResult.count || 0,
      fallbackDocuments: fallbackResult.count || 0,
      deletedDocuments: deletedResult.count || 0,
      oldestFallbackAt,
      backlogAgeHours,
    },
    health,
    metrics: {
      ...inMemoryMetrics,
      consecutiveFailures,
      source: persistentEvents.length > 0 ? 'database' : 'in-memory',
    },
    alerts,
    recentMigrationEvents: mergedEvents.slice(0, 12),
    recentFallbackDocuments: recentFallbackResult.data || [],
  }
}

export async function GET() {
  const access = await requireMaintenanceSession()
  if (!access.authorized) {
    return access.response
  }

  try {
    const overview = await getOverview()
    return apiOk(overview)
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load overview'), 500)
  }
}

export async function POST(request: NextRequest) {
  const access = await requireMaintenanceSession()
  if (!access.authorized) {
    return access.response
  }

  try {
    const body = await request.json().catch(() => ({}))
    const limit = Math.max(1, Math.min(50, Number(body?.limit) || 20))
    const health = await getDocumentStorageStatus({ runMaintenance: false })

    if (!health.connected) {
      return apiError('Primary storage is offline. Batch migration is unavailable.', 409)
    }

    const result = await migrateFallbackBatch(limit, { trigger: 'manual' })
    const overview = await getOverview()
    return apiOk({ result, overview })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Batch migration failed'), 500)
  }
}
