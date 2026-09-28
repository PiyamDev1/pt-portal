import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { formatIsoDateInTimezone } from '@/lib/dateFormatter'

type TrainingEnrollmentAttentionRow = {
  id: string
  status: string
  due_date: string | null
  certificate_expires_at: string | null
  created_at: string
}

export type TrainingAttentionSummary = {
  available: boolean
  attentionCount: number
  incompleteCount: number
  overdueCount: number
  dueSoonCount: number
  expiredCertificateCount: number
  expiringCertificateCount: number
  oldestAttentionAt: string | null
}

function unavailableSummary(): TrainingAttentionSummary {
  return {
    available: false,
    attentionCount: 0,
    incompleteCount: 0,
    overdueCount: 0,
    dueSoonCount: 0,
    expiredCertificateCount: 0,
    expiringCertificateCount: 0,
    oldestAttentionAt: null,
  }
}

function addDays(isoDate: string, days: number) {
  const value = new Date(`${isoDate}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function summarizeTrainingAttention(
  rows: TrainingEnrollmentAttentionRow[],
  generatedAt: string,
  timezone: string,
): TrainingAttentionSummary {
  const localDate = formatIsoDateInTimezone(generatedAt, timezone)
  const dueSoonDate = addDays(localDate, 7)
  const generatedAtMs = new Date(generatedAt).getTime()
  const expiryHorizonMs = generatedAtMs + 30 * 24 * 60 * 60 * 1000
  const attentionIds = new Set<string>()
  const attentionDates: string[] = []
  let incompleteCount = 0
  let overdueCount = 0
  let dueSoonCount = 0
  let expiredCertificateCount = 0
  let expiringCertificateCount = 0

  for (const row of rows) {
    const incomplete = row.status === 'assigned' || row.status === 'in_progress'
    const certificateExpiryMs = row.certificate_expires_at
      ? new Date(row.certificate_expires_at).getTime()
      : Number.NaN
    const expiredCertificate =
      row.status === 'expired' ||
      (Number.isFinite(certificateExpiryMs) && certificateExpiryMs <= generatedAtMs)
    const expiringCertificate =
      !expiredCertificate &&
      Number.isFinite(certificateExpiryMs) &&
      certificateExpiryMs <= expiryHorizonMs

    if (incomplete) {
      incompleteCount += 1
      if (row.due_date && row.due_date < localDate) overdueCount += 1
      if (row.due_date && row.due_date >= localDate && row.due_date <= dueSoonDate) {
        dueSoonCount += 1
      }
    }
    if (expiredCertificate) expiredCertificateCount += 1
    if (expiringCertificate) expiringCertificateCount += 1

    if (!incomplete && !expiredCertificate && !expiringCertificate) continue
    attentionIds.add(row.id)
    const attentionDate =
      (incomplete && row.due_date ? `${row.due_date}T00:00:00.000Z` : null) ||
      row.certificate_expires_at ||
      row.created_at
    if (Number.isFinite(new Date(attentionDate).getTime())) attentionDates.push(attentionDate)
  }

  attentionDates.sort()
  return {
    available: true,
    attentionCount: attentionIds.size,
    incompleteCount,
    overdueCount,
    dueSoonCount,
    expiredCertificateCount,
    expiringCertificateCount,
    oldestAttentionAt: attentionDates[0] || null,
  }
}

/** Reads only the signed-in employee's active-course enrolments. */
export async function loadTrainingAttentionSummary(
  supabase: SupabaseClient,
  input: { employeeId: string; generatedAt: string; timezone: string | null },
): Promise<TrainingAttentionSummary> {
  try {
    const { data, error } = await supabase
      .from('training_enrollments')
      .select(
        'id,status,due_date,certificate_expires_at,created_at,training_courses!inner(is_active)',
      )
      .eq('employee_id', input.employeeId)
      .eq('training_courses.is_active', true)
      .order('created_at', { ascending: true })

    if (error) return unavailableSummary()
    return summarizeTrainingAttention(
      (data || []) as unknown as TrainingEnrollmentAttentionRow[],
      input.generatedAt,
      input.timezone || 'Europe/London',
    )
  } catch {
    return unavailableSummary()
  }
}
