import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { loadMyCommissionData, type MyCommissionData } from '@/lib/commissions/server'
import {
  buildPerformanceAnalytics,
  formatLondonReportingDate,
  londonDateStartUtc,
  performanceReportingWindow,
  type PerformanceAnalytics,
  type PerformanceSourceFact,
  type PerformanceTimeclockEvent,
} from '@/lib/performance/analytics'
import { collectPagedRows } from '@/lib/performance/pagination'
import type { Database, Json } from '@/types/supabase'

type PerformanceClient = SupabaseClient<Database>

type SourceFactRow =
  Database['public']['Functions']['staff_performance_source_facts_2026083101']['Returns'][number]

type TimeclockRow =
  Database['public']['Functions']['staff_performance_timeclock_events_2026083101']['Returns'][number]

export type MyPerformanceData = {
  activityReady: boolean
  attendanceReady: boolean
  analytics: PerformanceAnalytics
  commission: MyCommissionData
}

function performanceClient() {
  return getServiceSupabaseClient() as unknown as PerformanceClient
}

function jsonObject(value: Json): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function missingDatabaseObject(error: { code?: string; message?: string } | null) {
  if (!error) return false
  return (
    ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code || '') ||
    /does not exist|schema cache/i.test(error.message || '')
  )
}

function addUtcDays(value: string, days: number) {
  const parsed = new Date(`${value}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString()
}

async function loadSourceFacts(
  supabase: PerformanceClient,
  employeeId: string,
  effectiveFrom: string,
  effectiveTo: string,
) {
  let unavailable = false
  const rows = await collectPagedRows<SourceFactRow>(async (offset, pageSize) => {
    const { data, error } = await supabase
      .rpc('staff_performance_source_facts_2026083101', {
        p_employee_id: employeeId,
        p_effective_from: effectiveFrom,
        p_effective_to: effectiveTo,
      })
      .order('effective_on', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error && missingDatabaseObject(error)) {
      unavailable = true
      return []
    }
    if (error) throw error
    return (data || []) as SourceFactRow[]
  })

  if (unavailable) {
    return { ready: false, facts: [] as PerformanceSourceFact[] }
  }

  return {
    ready: true,
    facts: rows.map(
      (row): PerformanceSourceFact => ({
        id: row.id,
        sourceModule: row.source_module,
        sourceFactKey: row.source_fact_key,
        sourceRecordId: row.source_record_id,
        eventType: row.event_type,
        eventVersion: row.event_version,
        employeeId: row.employee_id,
        ownerEmployeeId: row.owner_employee_id,
        effectiveOn: row.effective_on,
        sourcePath: row.source_path,
        variables: jsonObject(row.variables),
        createdAt: row.created_at,
      }),
    ),
  }
}

async function loadTimeclockEvents(
  supabase: PerformanceClient,
  employeeId: string,
  effectiveFrom: string,
  effectiveTo: string,
) {
  const rows: TimeclockRow[] = []
  const pageSize = 1000
  const boundaryBufferMilliseconds = 20 * 60 * 60_000
  const windowStart = new Date(
    londonDateStartUtc(effectiveFrom).getTime() - boundaryBufferMilliseconds,
  ).toISOString()
  const dayAfterEffectiveTo = addUtcDays(effectiveTo, 1).slice(0, 10)
  const windowEnd = new Date(
    londonDateStartUtc(dayAfterEffectiveTo).getTime() + boundaryBufferMilliseconds,
  ).toISOString()

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .rpc('staff_performance_timeclock_events_2026083101', {
        p_employee_id: employeeId,
        p_effective_from: windowStart,
        p_effective_to: windowEnd,
      })
      .order('effective_at', { ascending: true })
      .order('scanned_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error && missingDatabaseObject(error)) {
      return { ready: false, events: [] as PerformanceTimeclockEvent[] }
    }
    if (error) throw error
    const page = (data || []) as TimeclockRow[]
    rows.push(...page)
    if (page.length < pageSize) break
  }

  return {
    ready: true,
    events: rows.map(
      (row): PerformanceTimeclockEvent => ({
        id: row.id,
        eventType: row.event_type,
        punchType: row.punch_type,
        scannedAt: row.scanned_at,
        adjustedScannedAt: row.adjusted_scanned_at,
        deviceTimestamp: row.device_ts,
        adjustedDeviceTimestamp: row.adjusted_device_ts,
      }),
    ),
  }
}

export async function loadMyPerformanceData(
  employeeId: string,
  now = new Date(),
): Promise<MyPerformanceData> {
  const supabase = performanceClient()
  const reportingDate = formatLondonReportingDate(now)
  const { effectiveFrom, effectiveTo } = performanceReportingWindow(reportingDate)

  const [commission, sourceResult, timeclockResult] = await Promise.all([
    loadMyCommissionData(employeeId, now),
    loadSourceFacts(supabase, employeeId, effectiveFrom, effectiveTo),
    loadTimeclockEvents(supabase, employeeId, effectiveFrom, effectiveTo),
  ])

  return {
    activityReady: sourceResult.ready,
    attendanceReady: timeclockResult.ready,
    analytics: buildPerformanceAnalytics(
      sourceResult.facts,
      timeclockResult.events,
      employeeId,
      reportingDate,
      now,
    ),
    commission,
  }
}
