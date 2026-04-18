/**
 * Frappe Sync Engine
 *
 * Handles outbox enqueue, batch dispatch, inbox ingestion, and basic sync health tracking.
 */

import { getSupabaseClient } from '@/lib/supabaseClient'
import { frappeRequest } from '@/lib/integrations/frappe/client'
import {
  mapAttendanceToFrappePayload,
  mapLeaveToFrappePayload,
  mapLifecycleToFrappePayload,
  type AttendanceDailyRow,
  type LeaveRequestRow,
  type LifecycleRow,
} from '@/lib/integrations/frappe/mappers'

type SyncDomain = 'leave' | 'attendance' | 'lifecycle'
type OutboxStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'dead_letter'

type OutboxRow = {
  id: string
  domain: SyncDomain
  event_type: string
  aggregate_id: string
  payload: Record<string, unknown>
  dedupe_key: string
  status: OutboxStatus
  attempts: number
}

const MAX_RETRIES = 6

function computeRetryAt(attempts: number) {
  const backoffMs = Math.min(60_000, 1_000 * Math.pow(2, attempts))
  return new Date(Date.now() + backoffMs).toISOString()
}

function getFrappeEndpoint(row: OutboxRow) {
  if (row.domain === 'leave') return '/api/resource/Leave Application'
  if (row.domain === 'attendance') return '/api/resource/Attendance'
  return '/api/resource/Employee'
}

function normalizePayload(row: OutboxRow) {
  if (row.domain === 'leave') {
    return mapLeaveToFrappePayload(row.payload as unknown as LeaveRequestRow)
  }

  if (row.domain === 'attendance') {
    return mapAttendanceToFrappePayload(row.payload as unknown as AttendanceDailyRow)
  }

  return mapLifecycleToFrappePayload(row.payload as unknown as LifecycleRow)
}

export async function enqueueIntegrationEvent(params: {
  domain: SyncDomain
  eventType: string
  aggregateId: string
  dedupeKey: string
  payload: Record<string, unknown>
}) {
  const supabase = getSupabaseClient()

  const { error } = await supabase.from('integration_outbox').insert({
    domain: params.domain,
    event_type: params.eventType,
    aggregate_id: params.aggregateId,
    dedupe_key: params.dedupeKey,
    payload: params.payload,
    status: 'pending',
    next_retry_at: new Date().toISOString(),
  })

  if (error) {
    // Ignore duplicate dedupe key insert races and keep operation idempotent.
    if (!String(error.message || '').toLowerCase().includes('duplicate')) {
      throw error
    }
  }
}

export async function dispatchOutboxBatch(limit = 25) {
  const supabase = getSupabaseClient()
  const nowIso = new Date().toISOString()

  const { data: batch, error: fetchError } = await supabase
    .from('integration_outbox')
    .select('id, domain, event_type, aggregate_id, payload, dedupe_key, status, attempts')
    .eq('status', 'pending')
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (fetchError) {
    throw fetchError
  }

  const rows = (batch || []) as OutboxRow[]
  let processed = 0
  let failed = 0

  for (const row of rows) {
    const reserve = await supabase
      .from('integration_outbox')
      .update({ status: 'processing' })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (reserve.error || !reserve.data) {
      continue
    }

    try {
      const endpoint = getFrappeEndpoint(row)
      const payload = normalizePayload(row)

      await frappeRequest(endpoint, {
        method: 'POST',
        body: payload,
        idempotencyKey: row.dedupe_key,
        retries: 2,
      })

      const processedAt = new Date().toISOString()

      await Promise.all([
        supabase
          .from('integration_outbox')
          .update({
            status: 'processed',
            processed_at: processedAt,
            last_error: null,
            attempts: row.attempts + 1,
            next_retry_at: null,
          })
          .eq('id', row.id),
        supabase.from('integration_sync_state').upsert(
          {
            domain: row.domain,
            last_push_at: processedAt,
            health_status: 'healthy',
          },
          { onConflict: 'domain' },
        ),
      ])

      processed += 1
    } catch (error: unknown) {
      const nextAttempts = row.attempts + 1
      const deadLetter = nextAttempts >= MAX_RETRIES

      await Promise.all([
        supabase
          .from('integration_outbox')
          .update({
            status: deadLetter ? 'dead_letter' : 'pending',
            attempts: nextAttempts,
            next_retry_at: deadLetter ? null : computeRetryAt(nextAttempts),
            last_error: error instanceof Error ? error.message : String(error),
          })
          .eq('id', row.id),
        supabase.from('integration_sync_state').upsert(
          {
            domain: row.domain,
            health_status: deadLetter ? 'failed' : 'degraded',
          },
          { onConflict: 'domain' },
        ),
      ])

      failed += 1
    }
  }

  return {
    fetched: rows.length,
    processed,
    failed,
  }
}

export async function ingestInboundEvent(params: {
  source: string
  sourceEventId: string
  eventType: string
  payload: Record<string, unknown>
}) {
  const supabase = getSupabaseClient()

  const { error } = await supabase.from('integration_inbox').insert({
    source: params.source,
    source_event_id: params.sourceEventId,
    event_type: params.eventType,
    payload: params.payload,
    status: 'pending',
  })

  if (error) {
    if (String(error.message || '').toLowerCase().includes('duplicate')) {
      return { accepted: false, reason: 'duplicate' as const }
    }
    throw error
  }

  return { accepted: true as const }
}
