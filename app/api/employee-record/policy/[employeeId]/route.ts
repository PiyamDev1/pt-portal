import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type PolicyBody = {
  sickPayMode?: string | null
  sspEligibility?: string | null
  sspWeeklyRate?: number | null
  paidBreakMinutesPerShift?: number | null
  holidayEntitlementDays?: number | null
  bankHolidaysIncluded?: boolean | null
  pensionStatus?: string | null
  pensionProviderName?: string | null
  pensionEnrolmentDate?: string | null
  overtimeMode?: string | null
  overtimeThresholdHours?: number | null
  overtimeRateMultiplier?: number | null
  effectiveFrom?: string | null
  notes?: string | null
  policySource?: string | null
  policyContractType?: string | null
}

type EmployeePolicyContext = {
  employmentType: string | null
  payBasis: string | null
  hourlySource: string | null
  workingHoursPerWeek: number | null
}

type ContractPolicyDefaults = {
  contract_type: string
  sick_pay_mode: string | null
  ssp_eligibility_default: string | null
  ssp_weekly_rate_default: number | null
  paid_break_minutes_per_shift: number | null
  holiday_entitlement_days: number | null
  bank_holidays_included: boolean | null
  pension_status_default: string | null
  pension_provider_name_default: string | null
  overtime_mode: string | null
  overtime_threshold_hours: number | null
  overtime_rate_multiplier: number | null
}

const ALLOWED_SICK_PAY_MODES = ['none', 'statutory', 'full'] as const
const ALLOWED_OVERTIME_MODES = ['none', 'flat', 'tiered'] as const
const ALLOWED_SSP_ELIGIBILITY = ['not-assessed', 'eligible', 'not-eligible'] as const
const ALLOWED_PENSION_STATUS = ['not-assessed', 'eligible', 'enrolled', 'opted-out', 'postponed'] as const
const ALLOWED_POLICY_SOURCE = ['manual', 'uk-default'] as const

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

function roundTo2(value: number) {
  return Math.round(value * 100) / 100
}

function computeRecommendedHolidayDays(workingHoursPerWeek: number | null) {
  if (workingHoursPerWeek === null || workingHoursPerWeek <= 0) return 28
  const hoursPerDayBaseline = 7.5
  const effectiveDaysPerWeek = Math.max(1, Math.min(5, workingHoursPerWeek / hoursPerDayBaseline))
  return roundTo2(5.6 * effectiveDaysPerWeek)
}

function computeRecommendedPolicy(
  employee: EmployeePolicyContext,
  contractDefaults: ContractPolicyDefaults | null,
) {
  const isContractor = employee.employmentType === 'contractor'

  const recommended = {
    sickPayMode: contractDefaults?.sick_pay_mode || 'statutory',
    sspEligibility:
      contractDefaults?.ssp_eligibility_default || (isContractor ? 'not-eligible' : 'eligible'),
    sspWeeklyRate: contractDefaults?.ssp_weekly_rate_default ?? null,
    paidBreakMinutesPerShift: contractDefaults?.paid_break_minutes_per_shift ?? 0,
    holidayEntitlementDays:
      contractDefaults?.holiday_entitlement_days ??
      computeRecommendedHolidayDays(employee.workingHoursPerWeek),
    bankHolidaysIncluded: contractDefaults?.bank_holidays_included ?? true,
    pensionStatus:
      contractDefaults?.pension_status_default || (isContractor ? 'not-assessed' : 'eligible'),
    pensionProviderName: contractDefaults?.pension_provider_name_default || null,
    pensionEnrolmentDate: null,
    overtimeMode: contractDefaults?.overtime_mode || 'none',
    overtimeThresholdHours: contractDefaults?.overtime_threshold_hours ?? null,
    overtimeRateMultiplier: contractDefaults?.overtime_rate_multiplier ?? 1,
    effectiveFrom: null,
    notes:
      'Auto-generated from UK baseline guidance and contract policy defaults. Verify statutory rates and thresholds on GOV.UK each tax year.',
    policySource: 'uk-default',
    policyContractType: employee.employmentType,
  }

  return recommended
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

  const { data: employeeData } = await supabase
    .from('employees')
    .select('employment_type, pay_basis, hourly_source, working_hours_per_week')
    .eq('id', normalizedEmployeeId)
    .maybeSingle()

  const employmentType = employeeData?.employment_type ? String(employeeData.employment_type) : null

  let contractDefaults: ContractPolicyDefaults | null = null
  if (employmentType) {
    const { data: contractData } = await supabase
      .from('contract_policies')
      .select(
        'contract_type, sick_pay_mode, ssp_eligibility_default, ssp_weekly_rate_default, paid_break_minutes_per_shift, holiday_entitlement_days, bank_holidays_included, pension_status_default, pension_provider_name_default, overtime_mode, overtime_threshold_hours, overtime_rate_multiplier',
      )
      .eq('contract_type', employmentType)
      .maybeSingle()

    contractDefaults = (contractData as ContractPolicyDefaults | null) || null
  }

  const recommendedPolicy = computeRecommendedPolicy(
    {
      employmentType,
      payBasis: employeeData?.pay_basis ? String(employeeData.pay_basis) : null,
      hourlySource: employeeData?.hourly_source ? String(employeeData.hourly_source) : null,
      workingHoursPerWeek:
        typeof employeeData?.working_hours_per_week === 'number'
          ? employeeData.working_hours_per_week
          : null,
    },
    contractDefaults,
  )

  const { data, error } = await supabase
    .from('employee_policy_overrides')
    .select(
      'employee_id, sick_pay_mode, ssp_eligibility, ssp_weekly_rate, paid_break_minutes_per_shift, holiday_entitlement_days, bank_holidays_included, pension_status, pension_provider_name, pension_enrolment_date, overtime_mode, overtime_threshold_hours, overtime_rate_multiplier, effective_from, notes, policy_source, policy_contract_type',
    )
    .eq('employee_id', normalizedEmployeeId)
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (
      error.code === '42P01' ||
      error.code === '42703' ||
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column')
    ) {
      return apiOk({ supported: false, policy: null, recommendedPolicy, message: 'Policy table is not available yet. Run latest migration first.' })
    }

    return apiError(error.message || 'Failed to load employee policy', 500)
  }

  if (!data) return apiOk({ supported: true, policy: null, recommendedPolicy })

  return apiOk({
    supported: true,
    recommendedPolicy,
    policy: {
      employeeId: data.employee_id,
      sickPayMode: data.sick_pay_mode,
      sspEligibility: data.ssp_eligibility,
      sspWeeklyRate: data.ssp_weekly_rate,
      paidBreakMinutesPerShift: data.paid_break_minutes_per_shift,
      holidayEntitlementDays: data.holiday_entitlement_days,
      bankHolidaysIncluded: data.bank_holidays_included,
      pensionStatus: data.pension_status,
      pensionProviderName: data.pension_provider_name,
      pensionEnrolmentDate: data.pension_enrolment_date,
      overtimeMode: data.overtime_mode,
      overtimeThresholdHours: data.overtime_threshold_hours,
      overtimeRateMultiplier: data.overtime_rate_multiplier,
      effectiveFrom: data.effective_from,
      notes: data.notes,
      policySource: data.policy_source,
      policyContractType: data.policy_contract_type,
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
  const sspEligibility = body.sspEligibility ? String(body.sspEligibility).trim() : null
  const sspWeeklyRate = toNumberOrNull(body.sspWeeklyRate)
  const overtimeMode = body.overtimeMode ? String(body.overtimeMode).trim() : null
  const paidBreakMinutesPerShift = toNumberOrNull(body.paidBreakMinutesPerShift)
  const holidayEntitlementDays = toNumberOrNull(body.holidayEntitlementDays)
  const pensionStatus = body.pensionStatus ? String(body.pensionStatus).trim() : null
  const pensionProviderName = body.pensionProviderName ? String(body.pensionProviderName).trim() : null
  const pensionEnrolmentDate = toIsoDateOrNull(body.pensionEnrolmentDate)
  const overtimeThresholdHours = toNumberOrNull(body.overtimeThresholdHours)
  const overtimeRateMultiplier = toNumberOrNull(body.overtimeRateMultiplier)
  const effectiveFrom = toIsoDateOrNull(body.effectiveFrom)
  const notes = body.notes ? String(body.notes).trim() : null
  const policySource = body.policySource ? String(body.policySource).trim() : 'manual'
  const policyContractType = body.policyContractType ? String(body.policyContractType).trim() : null

  if (sickPayMode && !ALLOWED_SICK_PAY_MODES.includes(sickPayMode as (typeof ALLOWED_SICK_PAY_MODES)[number])) {
    return apiError('Invalid sick pay mode', 400)
  }

  if (overtimeMode && !ALLOWED_OVERTIME_MODES.includes(overtimeMode as (typeof ALLOWED_OVERTIME_MODES)[number])) {
    return apiError('Invalid overtime mode', 400)
  }

  if (sspEligibility && !ALLOWED_SSP_ELIGIBILITY.includes(sspEligibility as (typeof ALLOWED_SSP_ELIGIBILITY)[number])) {
    return apiError('Invalid SSP eligibility value', 400)
  }

  if (pensionStatus && !ALLOWED_PENSION_STATUS.includes(pensionStatus as (typeof ALLOWED_PENSION_STATUS)[number])) {
    return apiError('Invalid pension status value', 400)
  }

  if (!ALLOWED_POLICY_SOURCE.includes(policySource as (typeof ALLOWED_POLICY_SOURCE)[number])) {
    return apiError('Invalid policy source', 400)
  }

  if (sspWeeklyRate !== null && sspWeeklyRate < 0) {
    return apiError('SSP weekly rate cannot be negative', 400)
  }

  if (paidBreakMinutesPerShift !== null && paidBreakMinutesPerShift < 0) {
    return apiError('Paid break minutes cannot be negative', 400)
  }

  if (holidayEntitlementDays !== null && holidayEntitlementDays < 0) {
    return apiError('Holiday entitlement cannot be negative', 400)
  }

  if (holidayEntitlementDays !== null && holidayEntitlementDays < 5.6) {
    return apiError('Holiday entitlement appears too low. Enter pro-rated annual days, based on at least 5.6 weeks legal minimum.', 400)
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

  if (body.pensionEnrolmentDate && !pensionEnrolmentDate) {
    return apiError('Invalid pension enrolment date', 400)
  }

  const supabase = getSupabaseClient()
  const payload = {
    employee_id: normalizedEmployeeId,
    sick_pay_mode: sickPayMode,
    ssp_eligibility: sspEligibility,
    ssp_weekly_rate: sspWeeklyRate,
    paid_break_minutes_per_shift: paidBreakMinutesPerShift,
    holiday_entitlement_days: holidayEntitlementDays,
    bank_holidays_included:
      typeof body.bankHolidaysIncluded === 'boolean' ? body.bankHolidaysIncluded : null,
    pension_status: pensionStatus,
    pension_provider_name: pensionProviderName,
    pension_enrolment_date: pensionEnrolmentDate,
    overtime_mode: overtimeMode,
    overtime_threshold_hours: overtimeThresholdHours,
    overtime_rate_multiplier: overtimeRateMultiplier,
    effective_from: effectiveFrom,
    notes,
    policy_source: policySource,
    policy_contract_type: policyContractType,
    updated_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('employee_policy_overrides')
    .upsert(payload, { onConflict: 'employee_id' })
    .select(
      'employee_id, sick_pay_mode, ssp_eligibility, ssp_weekly_rate, paid_break_minutes_per_shift, holiday_entitlement_days, bank_holidays_included, pension_status, pension_provider_name, pension_enrolment_date, overtime_mode, overtime_threshold_hours, overtime_rate_multiplier, effective_from, notes, policy_source, policy_contract_type',
    )
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (
      error.code === '42P01' ||
      error.code === '42703' ||
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column')
    ) {
      return apiError('Policy table is not available yet. Run latest migration first.', 400)
    }

    return apiError(error.message || 'Failed to update employee policy', 500)
  }

  return apiOk({
    policy: {
      employeeId: data?.employee_id,
      sickPayMode: data?.sick_pay_mode,
      sspEligibility: data?.ssp_eligibility,
      sspWeeklyRate: data?.ssp_weekly_rate,
      paidBreakMinutesPerShift: data?.paid_break_minutes_per_shift,
      holidayEntitlementDays: data?.holiday_entitlement_days,
      bankHolidaysIncluded: data?.bank_holidays_included,
      pensionStatus: data?.pension_status,
      pensionProviderName: data?.pension_provider_name,
      pensionEnrolmentDate: data?.pension_enrolment_date,
      overtimeMode: data?.overtime_mode,
      overtimeThresholdHours: data?.overtime_threshold_hours,
      overtimeRateMultiplier: data?.overtime_rate_multiplier,
      effectiveFrom: data?.effective_from,
      notes: data?.notes,
      policySource: data?.policy_source,
      policyContractType: data?.policy_contract_type,
    },
  })
}
