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

type TimeclockEventRow = {
  employee_id: string
  punch_type: string | null
  scanned_at: string | null
  adjusted_scanned_at: string | null
  device_ts: string | null
  adjusted_device_ts: string | null
}

type AttendanceSummary = {
  employeeId: string
  attendanceDate: string
  firstPunchAt: string | null
  lastPunchAt: string | null
  workedMinutes: number
  status: 'present' | 'half_day'
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

function getEffectivePunchTime(row: TimeclockEventRow) {
  return row.adjusted_scanned_at || row.scanned_at || row.adjusted_device_ts || row.device_ts || null
}

function getAttendanceDate(iso: string) {
  return iso.slice(0, 10)
}

function getPunchType(row: TimeclockEventRow) {
  return String(row.punch_type || '').trim().toUpperCase()
}

function calculateAttendanceSummary(rows: TimeclockEventRow[]): AttendanceSummary | null {
  const ordered = rows
    .map((row) => ({
      ...row,
      effectiveTime: getEffectivePunchTime(row),
    }))
    .filter((row): row is TimeclockEventRow & { effectiveTime: string } => Boolean(row.effectiveTime))
    .sort((a, b) => new Date(a.effectiveTime).getTime() - new Date(b.effectiveTime).getTime())

  if (ordered.length === 0) return null

  const firstPunchAt = ordered[0].effectiveTime
  const lastPunchAt = ordered[ordered.length - 1].effectiveTime
  const firstTime = new Date(firstPunchAt).getTime()
  const lastTime = new Date(lastPunchAt).getTime()

  let workedMinutes = 0
  let openPunch: string | null = null

  for (const row of ordered) {
    const punchTime = row.effectiveTime
    const punchType = getPunchType(row)

    if (punchType === 'IN' || punchType === 'CLOCK_IN' || punchType === 'PUNCH_IN') {
      openPunch = punchTime
      continue
    }

    if (punchType === 'OUT' || punchType === 'CLOCK_OUT' || punchType === 'PUNCH_OUT') {
      if (openPunch) {
        const duration = (new Date(punchTime).getTime() - new Date(openPunch).getTime()) / 60000
        if (duration > 0) {
          workedMinutes += duration
        }
      }
      openPunch = null
    }
  }

  if (workedMinutes === 0 && firstTime > 0 && lastTime > firstTime) {
    workedMinutes = Math.round((lastTime - firstTime) / 60000)
  }

  const status = workedMinutes >= 240 ? 'present' : 'half_day'

  return {
    employeeId: ordered[0].employee_id,
    attendanceDate: getAttendanceDate(firstPunchAt),
    firstPunchAt,
    lastPunchAt,
    workedMinutes: Math.max(0, Math.round(workedMinutes)),
    status,
  }
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

async function listAttendancePunchesForDay(employeeId: string, attendanceDate: string) {
  const supabase = getSupabaseClient()
  const start = `${attendanceDate}T00:00:00.000Z`
  const end = `${attendanceDate}T23:59:59.999Z`
  const { data, error } = await supabase
    .from('timeclock_events')
    .select('employee_id, punch_type, scanned_at, adjusted_scanned_at, device_ts, adjusted_device_ts')
    .eq('employee_id', employeeId)
    .gte('scanned_at', start)
    .lte('scanned_at', end)
    .order('scanned_at', { ascending: true })

  if (error) throw error
  return (data || []) as TimeclockEventRow[]
}

async function enqueueAttendanceSummary(summary: AttendanceSummary) {
  const supabase = getSupabaseClient()
  const dedupeKey = `attendance:${summary.employeeId}:${summary.attendanceDate}`
  const payload = {
    employee_id: summary.employeeId,
    attendance_date: summary.attendanceDate,
    first_punch_at: summary.firstPunchAt,
    last_punch_at: summary.lastPunchAt,
    worked_minutes: summary.workedMinutes,
    status: summary.status,
    source: 'timeclock',
  }

  const { error } = await supabase.from('integration_outbox').upsert(
    {
      domain: 'attendance',
      event_type: 'attendance.summary',
      aggregate_id: `${summary.employeeId}:${summary.attendanceDate}`,
      dedupe_key: dedupeKey,
      payload,
      status: 'pending',
      next_retry_at: new Date().toISOString(),
    },
    { onConflict: 'dedupe_key' },
  )

  if (error) throw error
}

export async function queueAttendanceSyncForEmployeeDay(employeeId: string, attendanceDate: string) {
  const rows = await listAttendancePunchesForDay(employeeId, attendanceDate)
  const summary = calculateAttendanceSummary(rows)
  if (!summary) return { queued: false, reason: 'No punches found for day' }

  await enqueueAttendanceSummary(summary)
  return { queued: true, attendanceDate, employeeId, status: summary.status }
}

export async function queueRecentTimeclockAttendance(daysBack = 3) {
  const supabase = getSupabaseClient()
  const start = new Date()
  start.setUTCDate(start.getUTCDate() - Math.max(0, daysBack))
  start.setUTCHours(0, 0, 0, 0)
  const startIso = start.toISOString()

  const { data, error } = await supabase
    .from('timeclock_events')
    .select('employee_id, scanned_at, adjusted_scanned_at')
    .gte('scanned_at', startIso)
    .order('scanned_at', { ascending: true })

  if (error) throw error

  const buckets = new Map<string, Set<string>>()
  for (const row of (data || []) as Array<{ employee_id: string; scanned_at: string; adjusted_scanned_at?: string | null }>) {
    const effective = row.adjusted_scanned_at || row.scanned_at
    if (!effective) continue
    const key = `${row.employee_id}:${effective.slice(0, 10)}`
    if (!buckets.has(row.employee_id)) buckets.set(row.employee_id, new Set())
    buckets.get(row.employee_id)!.add(key)
  }

  let queued = 0
  for (const [employeeId, dayKeys] of buckets.entries()) {
    for (const key of dayKeys) {
      const attendanceDate = key.split(':').slice(1).join(':')
      const result = await queueAttendanceSyncForEmployeeDay(employeeId, attendanceDate)
      if (result.queued) queued += 1
    }
  }

  return { queued }
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
