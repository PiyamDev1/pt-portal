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
  mapLeaveStatusFromFrappe,
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

type InboxRow = {
  id: string
  event_type: string
  source_event_id: string
  payload: Record<string, unknown>
}

type FrappeLeaveRecord = {
  name: string
  employee?: string | null
  leave_type?: string | null
  from_date?: string | null
  to_date?: string | null
  half_day?: number | boolean | null
  half_day_date?: string | null
  total_leave_days?: number | string | null
  status?: string | null
  description?: string | null
  modified?: string | null
}

const MAX_RETRIES = 6
const FRAPPE_DOMAIN = 'hrms'

function computeRetryAt(attempts: number) {
  const backoffMs = Math.min(60_000, 1_000 * Math.pow(2, attempts))
  return new Date(Date.now() + backoffMs).toISOString()
}

function getFrappeEndpoint(row: OutboxRow) {
  if (row.domain === 'leave') return '/api/resource/Leave Application'
  if (row.domain === 'attendance') return '/api/resource/Attendance'
  return '/api/resource/Employee'
}

async function resolveFrappeEmployeeId(employeeId: string) {
  const supabase = getSupabaseClient()
  const { data: identity, error } = await supabase
    .from('integration_identity_map')
    .select('frappe_employee_id')
    .eq('domain', FRAPPE_DOMAIN)
    .eq('supabase_employee_id', employeeId)
    .maybeSingle()

  if (error) throw error

  const frappeEmployeeId = String(identity?.frappe_employee_id || '').trim()
  if (!frappeEmployeeId) {
    throw new Error(`Employee ${employeeId} has not been transferred to Frappe HRMS`)
  }

  return frappeEmployeeId
}

async function resolveLeaveTypeName(leaveTypeId: string) {
  const supabase = getSupabaseClient()
  const { data: leaveType, error } = await supabase
    .from('leave_types')
    .select('name, code')
    .eq('id', leaveTypeId)
    .maybeSingle()

  if (error) throw error

  return String(leaveType?.name || leaveType?.code || leaveTypeId).trim()
}

async function normalizePayload(row: OutboxRow) {
  if (row.domain === 'leave') {
    const record = row.payload as unknown as LeaveRequestRow
    const [frappeEmployeeId, frappeLeaveType] = await Promise.all([
      resolveFrappeEmployeeId(record.employee_id),
      resolveLeaveTypeName(record.leave_type_id),
    ])

    return mapLeaveToFrappePayload({
      ...record,
      employee_id: frappeEmployeeId,
      leave_type_id: frappeLeaveType,
    })
  }

  if (row.domain === 'attendance') {
    const record = row.payload as unknown as AttendanceDailyRow
    const frappeEmployeeId = await resolveFrappeEmployeeId(record.employee_id)

    return mapAttendanceToFrappePayload({
      ...record,
      employee_id: frappeEmployeeId,
    })
  }

  const record = row.payload as unknown as LifecycleRow
  const frappeEmployeeId = await resolveFrappeEmployeeId(record.employee_id)

  return mapLifecycleToFrappePayload({
    ...record,
    employee_id: frappeEmployeeId,
  })
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
      const payload = await normalizePayload(row)

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

export async function pullLeaveEvents(limit = 100) {
  const supabase = getSupabaseClient()
  const { data: syncState } = await supabase
    .from('integration_sync_state')
    .select('last_pull_at')
    .eq('domain', 'leave')
    .maybeSingle()

  const lastPullAt = syncState?.last_pull_at || null
  const fields = JSON.stringify([
    'name',
    'employee',
    'leave_type',
    'from_date',
    'to_date',
    'half_day',
    'half_day_date',
    'total_leave_days',
    'status',
    'description',
    'modified',
  ])

  const filters = lastPullAt
    ? JSON.stringify([['modified', '>=', lastPullAt]])
    : undefined

  const response = await frappeRequest<{ data?: FrappeLeaveRecord[] }>('/api/resource/Leave Application', {
    method: 'GET',
    query: {
      fields,
      filters,
      order_by: 'modified asc',
      limit_page_length: limit,
    },
  })

  const rows = response.data || []
  let accepted = 0
  let duplicates = 0

  for (const row of rows) {
    const sourceEventId = `${row.name}:${row.modified || 'unknown'}`
    const result = await ingestInboundEvent({
      source: 'frappe',
      sourceEventId,
      eventType: 'leave.updated',
      payload: row as unknown as Record<string, unknown>,
    })
    if (result.accepted) accepted += 1
    else duplicates += 1
  }

  await supabase.from('integration_sync_state').upsert({
    domain: 'leave',
    last_pull_at: new Date().toISOString(),
    health_status: 'healthy',
    details: {
      last_pull_batch_size: rows.length,
    },
  }, { onConflict: 'domain' })

  return {
    fetched: rows.length,
    accepted,
    duplicates,
  }
}

export async function reconcileInboundLeaveEvents(limit = 100) {
  const supabase = getSupabaseClient()
  const { data: inboxRows, error } = await supabase
    .from('integration_inbox')
    .select('id, event_type, source_event_id, payload')
    .eq('source', 'frappe')
    .eq('status', 'pending')
    .order('received_at', { ascending: true })
    .limit(limit)

  if (error) throw error

  let processed = 0
  let failed = 0
  let conflicts = 0

  for (const row of (inboxRows || []) as InboxRow[]) {
    try {
      const applied = await applyInboundLeaveEvent(row)
      await supabase
        .from('integration_inbox')
        .update({
          status: 'processed',
          processed_at: new Date().toISOString(),
          error: null,
        })
        .eq('id', row.id)

      processed += 1
      conflicts += applied.conflictCreated ? 1 : 0
    } catch (applyError) {
      failed += 1
      await supabase
        .from('integration_inbox')
        .update({
          status: 'failed',
          error: applyError instanceof Error ? applyError.message : String(applyError),
        })
        .eq('id', row.id)
    }
  }

  await supabase.from('integration_sync_state').upsert({
    domain: 'leave',
    health_status: failed > 0 ? 'degraded' : 'healthy',
    details: {
      last_reconcile_processed: processed,
      last_reconcile_failed: failed,
      last_reconcile_conflicts: conflicts,
    },
  }, { onConflict: 'domain' })

  return {
    processed,
    failed,
    conflicts,
  }
}

async function applyInboundLeaveEvent(row: InboxRow) {
  const supabase = getSupabaseClient()
  const payload = row.payload as unknown as FrappeLeaveRecord
  const frappeDocname = String(payload.name || '').trim()
  if (!frappeDocname) {
    throw new Error('Inbound leave payload missing docname')
  }

  const employeeCode = String(payload.employee || '').trim()
  if (!employeeCode) {
    throw new Error(`Leave ${frappeDocname} missing employee code`)
  }

  const { data: identity } = await supabase
    .from('integration_identity_map')
    .select('supabase_employee_id, frappe_employee_id')
    .eq('domain', FRAPPE_DOMAIN)
    .eq('frappe_employee_id', employeeCode)
    .maybeSingle()

  if (!identity?.supabase_employee_id) {
    throw new Error(`No identity map row for Frappe employee ${employeeCode}`)
  }

  const leaveTypeName = String(payload.leave_type || '').trim()
  const { data: leaveType } = await supabase
    .from('leave_types')
    .select('id, name, code')
    .or(`name.ilike.${escapeSupabaseLike(leaveTypeName)},code.ilike.${escapeSupabaseLike(slugifyCode(leaveTypeName))}`)
    .maybeSingle()

  if (!leaveType?.id) {
    throw new Error(`No leave type mapped for "${leaveTypeName}"`)
  }

  const nextState = {
    employee_id: identity.supabase_employee_id,
    leave_type_id: leaveType.id,
    from_date: payload.from_date,
    to_date: payload.to_date,
    half_day: payload.half_day === true || Number(payload.half_day || 0) === 1,
    half_day_date: payload.half_day_date || null,
    requested_days: Number(payload.total_leave_days || 0),
    status: mapLeaveStatusFromFrappe(payload.status),
    rejection_reason: payload.description || null,
    frappe_docname: frappeDocname,
    source_system: 'frappe',
    synced_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('leave_requests')
    .select('*')
    .eq('frappe_docname', frappeDocname)
    .maybeSingle()

  if (existing && existing.source_system === 'pt_portal' && Number(existing.sync_version || 1) > 1) {
    await supabase.from('integration_conflicts').insert({
      domain: 'leave',
      entity_id: existing.id,
      supabase_snapshot: existing,
      frappe_snapshot: payload,
      notes: `Conflict detected while reconciling leave ${frappeDocname}`,
      status: 'open',
    })
    return { conflictCreated: true }
  }

  if (existing?.id) {
    const { error: updateError } = await supabase
      .from('leave_requests')
      .update(nextState)
      .eq('id', existing.id)
    if (updateError) throw updateError
    return { conflictCreated: false }
  }

  const { error: insertError } = await supabase
    .from('leave_requests')
    .insert({
      ...nextState,
      sync_version: 1,
    })
  if (insertError) throw insertError

  return { conflictCreated: false }
}

function slugifyCode(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '_')
}

function escapeSupabaseLike(value: string) {
  return `%${value.replace(/[%_,]/g, '')}%`
}
