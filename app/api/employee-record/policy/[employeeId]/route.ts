import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type PolicyBody = {
  sickPayMode?: string | null
  paidBreakMinutesPerShift?: number | null
  holidayEntitlementDays?: number | null
  bankHolidaysIncluded?: boolean | null
  overtimeMode?: string | null
  overtimeThresholdHours?: number | null
  overtimeRateMultiplier?: number | null
  effectiveFrom?: string | null
  notes?: string | null
}

const ALLOWED_SICK_PAY_MODES = ['none', 'statutory', 'full'] as const
const ALLOWED_OVERTIME_MODES = ['none', 'flat', 'tiered'] as const

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function toIsoDateOrNull(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return raw
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ employeeId: string }> },
) {
  const auth = await requireAdminSession()
  if (!auth.authorized) return auth.response

  const { employeeId } = await context.params
  const normalizedEmployeeId = String(employeeId || '').trim()
  if (!normalizedEmployeeId) return apiError('employeeId is required', 400)

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('employee_policy_overrides')
    .select(
      'employee_id, sick_pay_mode, paid_break_minutes_per_shift, holiday_entitlement_days, bank_holidays_included, overtime_mode, overtime_threshold_hours, overtime_rate_multiplier, effective_from, notes',
    )
    .eq('employee_id', normalizedEmployeeId)
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (error.code === '42P01' || message.includes('does not exist') || message.includes('relation')) {
      return apiOk({ supported: false, policy: null, message: 'Policy table is not available yet. Run latest migration first.' })
    }

    return apiError(error.message || 'Failed to load employee policy', 500)
  }

  if (!data) return apiOk({ supported: true, policy: null })

  return apiOk({
    supported: true,
    policy: {
      employeeId: data.employee_id,
      sickPayMode: data.sick_pay_mode,
      paidBreakMinutesPerShift: data.paid_break_minutes_per_shift,
      holidayEntitlementDays: data.holiday_entitlement_days,
      bankHolidaysIncluded: data.bank_holidays_included,
      overtimeMode: data.overtime_mode,
      overtimeThresholdHours: data.overtime_threshold_hours,
      overtimeRateMultiplier: data.overtime_rate_multiplier,
      effectiveFrom: data.effective_from,
      notes: data.notes,
    },
  })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ employeeId: string }> },
) {
  const auth = await requireAdminSession()
  if (!auth.authorized) return auth.response

  const { employeeId } = await context.params
  const normalizedEmployeeId = String(employeeId || '').trim()
  if (!normalizedEmployeeId) return apiError('employeeId is required', 400)

  const body = (await request.json().catch(() => ({}))) as PolicyBody

  const sickPayMode = body.sickPayMode ? String(body.sickPayMode).trim() : null
  const overtimeMode = body.overtimeMode ? String(body.overtimeMode).trim() : null
  const paidBreakMinutesPerShift = toNumberOrNull(body.paidBreakMinutesPerShift)
  const holidayEntitlementDays = toNumberOrNull(body.holidayEntitlementDays)
  const overtimeThresholdHours = toNumberOrNull(body.overtimeThresholdHours)
  const overtimeRateMultiplier = toNumberOrNull(body.overtimeRateMultiplier)
  const effectiveFrom = toIsoDateOrNull(body.effectiveFrom)
  const notes = body.notes ? String(body.notes).trim() : null

  if (sickPayMode && !ALLOWED_SICK_PAY_MODES.includes(sickPayMode as (typeof ALLOWED_SICK_PAY_MODES)[number])) {
    return apiError('Invalid sick pay mode', 400)
  }

  if (overtimeMode && !ALLOWED_OVERTIME_MODES.includes(overtimeMode as (typeof ALLOWED_OVERTIME_MODES)[number])) {
    return apiError('Invalid overtime mode', 400)
  }

  if (paidBreakMinutesPerShift !== null && paidBreakMinutesPerShift < 0) {
    return apiError('Paid break minutes cannot be negative', 400)
  }

  if (holidayEntitlementDays !== null && holidayEntitlementDays < 0) {
    return apiError('Holiday entitlement cannot be negative', 400)
  }

  if (overtimeThresholdHours !== null && overtimeThresholdHours < 0) {
    return apiError('Overtime threshold cannot be negative', 400)
  }

  if (overtimeRateMultiplier !== null && overtimeRateMultiplier < 1) {
    return apiError('Overtime multiplier must be at least 1', 400)
  }

  if (body.effectiveFrom && !effectiveFrom) {
    return apiError('Invalid policy effective-from date', 400)
  }

  const supabase = getSupabaseClient()
  const payload = {
    employee_id: normalizedEmployeeId,
    sick_pay_mode: sickPayMode,
    paid_break_minutes_per_shift: paidBreakMinutesPerShift,
    holiday_entitlement_days: holidayEntitlementDays,
    bank_holidays_included:
      typeof body.bankHolidaysIncluded === 'boolean' ? body.bankHolidaysIncluded : null,
    overtime_mode: overtimeMode,
    overtime_threshold_hours: overtimeThresholdHours,
    overtime_rate_multiplier: overtimeRateMultiplier,
    effective_from: effectiveFrom,
    notes,
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('employee_policy_overrides')
    .upsert(payload, { onConflict: 'employee_id' })
    .select(
      'employee_id, sick_pay_mode, paid_break_minutes_per_shift, holiday_entitlement_days, bank_holidays_included, overtime_mode, overtime_threshold_hours, overtime_rate_multiplier, effective_from, notes',
    )
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (error.code === '42P01' || message.includes('does not exist') || message.includes('relation')) {
      return apiError('Policy table is not available yet. Run latest migration first.', 400)
    }

    return apiError(error.message || 'Failed to update employee policy', 500)
  }

  return apiOk({
    policy: {
      employeeId: data?.employee_id,
      sickPayMode: data?.sick_pay_mode,
      paidBreakMinutesPerShift: data?.paid_break_minutes_per_shift,
      holidayEntitlementDays: data?.holiday_entitlement_days,
      bankHolidaysIncluded: data?.bank_holidays_included,
      overtimeMode: data?.overtime_mode,
      overtimeThresholdHours: data?.overtime_threshold_hours,
      overtimeRateMultiplier: data?.overtime_rate_multiplier,
      effectiveFrom: data?.effective_from,
      notes: data?.notes,
    },
  })
}
