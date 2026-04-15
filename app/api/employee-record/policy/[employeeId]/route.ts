import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type PolicyBody = {
  sickPayMode?: string | null
  sspEligibility?: string | null
  sspWeeklyRate?: number | null
  sspMaxWeeks?: number | null
  sspRateMode?: string | null
  paidBreakMinutesPerShift?: number | null
  holidayEntitlementDays?: number | null
  companyPaidHolidayDays?: number | null
  companyUnpaidHolidayDays?: number | null
  bankHolidaysIncluded?: boolean | null
  pensionStatus?: string | null
  pensionProviderName?: string | null
  pensionEnrolmentDate?: string | null
  leaveAccrualMode?: string | null
  leaveAccruedDays?: number | null
  leaveAccrualAsOf?: string | null
  overtimeMode?: string | null
  overtimeThresholdHours?: number | null
  overtimeRateMultiplier?: number | null
  effectiveFrom?: string | null
  notes?: string | null
  policySource?: string | null
  policyContractType?: string | null
  assignedCompanyHolidayIds?: string[]
  companyCalendarEntries?: Array<{
    id: string
    holidayDate?: string | null
    isPaid?: boolean
    countsTowardAnnualLeave?: boolean
    notes?: string | null
    active?: boolean
  }>
}

type EmployeePolicyContext = {
  employmentType: string | null
  payBasis: string | null
  hourlySource: string | null
  employmentStartDate: string | null
  workingHoursPerWeek: number | null
  hourlyRate: number | null
  annualSalary: number | null
}

type ContractPolicyDefaults = {
  contract_type: string
  sick_pay_mode: string | null
  ssp_eligibility_default: string | null
  ssp_weekly_rate_default: number | null
  ssp_max_weeks_default: number | null
  ssp_rate_mode_default: string | null
  paid_break_minutes_per_shift: number | null
  holiday_entitlement_days: number | null
  company_paid_holiday_days_default: number | null
  company_unpaid_holiday_days_default: number | null
  bank_holidays_included: boolean | null
  pension_status_default: string | null
  pension_provider_name_default: string | null
  leave_accrual_mode_default: string | null
  overtime_mode: string | null
  overtime_threshold_hours: number | null
  overtime_rate_multiplier: number | null
}

const ALLOWED_SICK_PAY_MODES = ['none', 'statutory', 'full'] as const
const ALLOWED_OVERTIME_MODES = ['none', 'flat', 'tiered'] as const
const ALLOWED_SSP_ELIGIBILITY = ['not-assessed', 'eligible', 'not-eligible'] as const
const ALLOWED_SSP_RATE_MODE = ['lower-of-cap-or-80pct', 'fixed'] as const
const ALLOWED_PENSION_STATUS = ['not-assessed', 'eligible', 'enrolled', 'opted-out', 'postponed'] as const
const ALLOWED_POLICY_SOURCE = ['manual', 'uk-default'] as const
const ALLOWED_LEAVE_ACCRUAL_MODE = ['none', 'monthly', 'pro-rata-hours'] as const
const SSP_WEEKLY_CAP_GBP = 123.25

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

function computeAccruedLeaveDays(
  employmentStartDate: string | null,
  annualEntitlementDays: number,
  leaveAccrualMode: string,
) {
  if (leaveAccrualMode === 'none') return 0
  if (!employmentStartDate) return 0

  const start = new Date(employmentStartDate)
  if (Number.isNaN(start.getTime())) return 0

  const today = new Date()
  if (today <= start) return 0

  const elapsedMs = today.getTime() - start.getTime()
  const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24)

  if (leaveAccrualMode === 'monthly') {
    const months = Math.min(12, Math.max(0, elapsedDays / 30.4375))
    return roundTo2((annualEntitlementDays / 12) * months)
  }

  const fractionOfYear = Math.min(1, Math.max(0, elapsedDays / 365))
  return roundTo2(annualEntitlementDays * fractionOfYear)
}

function computeRecommendedPolicy(
  employee: EmployeePolicyContext,
  contractDefaults: ContractPolicyDefaults | null,
) {
  const isContractor = employee.employmentType === 'contractor'
  const leaveAccrualMode = contractDefaults?.leave_accrual_mode_default || 'monthly'
  const holidayEntitlementDays =
    contractDefaults?.holiday_entitlement_days ??
    computeRecommendedHolidayDays(employee.workingHoursPerWeek)
  const leaveAccruedDays = computeAccruedLeaveDays(
    employee.employmentStartDate,
    holidayEntitlementDays,
    leaveAccrualMode,
  )

  const normalWeeklyEarnings =
    employee.hourlyRate !== null && employee.workingHoursPerWeek !== null
      ? employee.hourlyRate * employee.workingHoursPerWeek
      : employee.annualSalary !== null
        ? employee.annualSalary / 52
        : null

  const sspRateMode = contractDefaults?.ssp_rate_mode_default || 'lower-of-cap-or-80pct'
  const statutoryCalculatedSsp =
    normalWeeklyEarnings !== null
      ? roundTo2(Math.min(SSP_WEEKLY_CAP_GBP, normalWeeklyEarnings * 0.8))
      : SSP_WEEKLY_CAP_GBP

  const recommended = {
    // Contractual sick pay setting is separate from SSP eligibility/rate below.
    sickPayMode: contractDefaults?.sick_pay_mode || 'statutory',
    sspEligibility:
      contractDefaults?.ssp_eligibility_default || (isContractor ? 'not-eligible' : 'eligible'),
    sspWeeklyRate:
      contractDefaults?.ssp_weekly_rate_default ??
      (isContractor ? null : statutoryCalculatedSsp),
    sspMaxWeeks: contractDefaults?.ssp_max_weeks_default ?? 28,
    sspRateMode: sspRateMode,
    paidBreakMinutesPerShift: contractDefaults?.paid_break_minutes_per_shift ?? 0,
    holidayEntitlementDays,
    companyPaidHolidayDays: contractDefaults?.company_paid_holiday_days_default ?? 4,
    companyUnpaidHolidayDays: contractDefaults?.company_unpaid_holiday_days_default ?? 1,
    bankHolidaysIncluded: contractDefaults?.bank_holidays_included ?? true,
    pensionStatus:
      contractDefaults?.pension_status_default || (isContractor ? 'not-assessed' : 'eligible'),
    pensionProviderName: contractDefaults?.pension_provider_name_default || null,
    pensionEnrolmentDate: null,
    leaveAccrualMode,
    leaveAccruedDays,
    leaveAccrualAsOf: new Date().toISOString().slice(0, 10),
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
    .select('employment_type, pay_basis, hourly_source, working_hours_per_week, employment_start_date, hourly_rate, annual_salary')
    .eq('id', normalizedEmployeeId)
    .maybeSingle()

  const employmentType = employeeData?.employment_type ? String(employeeData.employment_type) : null

  let contractDefaults: ContractPolicyDefaults | null = null
  if (employmentType) {
    const { data: contractData } = await supabase
      .from('contract_policies')
      .select(
        'contract_type, sick_pay_mode, ssp_eligibility_default, ssp_weekly_rate_default, ssp_max_weeks_default, ssp_rate_mode_default, paid_break_minutes_per_shift, holiday_entitlement_days, company_paid_holiday_days_default, company_unpaid_holiday_days_default, bank_holidays_included, pension_status_default, pension_provider_name_default, leave_accrual_mode_default, overtime_mode, overtime_threshold_hours, overtime_rate_multiplier',
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
      employmentStartDate: employeeData?.employment_start_date
        ? String(employeeData.employment_start_date)
        : null,
      hourlyRate:
        typeof employeeData?.hourly_rate === 'number' ? employeeData.hourly_rate : null,
      annualSalary:
        typeof employeeData?.annual_salary === 'number' ? employeeData.annual_salary : null,
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
      'employee_id, sick_pay_mode, ssp_eligibility, ssp_weekly_rate, ssp_max_weeks, ssp_rate_mode, paid_break_minutes_per_shift, holiday_entitlement_days, company_paid_holiday_days, company_unpaid_holiday_days, bank_holidays_included, pension_status, pension_provider_name, pension_enrolment_date, leave_accrual_mode, leave_accrued_days, leave_accrual_as_of, overtime_mode, overtime_threshold_hours, overtime_rate_multiplier, effective_from, notes, policy_source, policy_contract_type',
    )
    .eq('employee_id', normalizedEmployeeId)
    .maybeSingle()

  const { data: calendarData } = await supabase
    .from('company_holiday_calendar')
    .select('id, holiday_key, holiday_name, holiday_date, is_paid, counts_toward_annual_leave, active, notes')
    .order('holiday_name', { ascending: true })

  const { data: assignmentData } = await supabase
    .from('employee_company_holiday_assignments')
    .select('company_holiday_id')
    .eq('employee_id', normalizedEmployeeId)

  const companyCalendar = (calendarData || []).map((row) => ({
    id: row.id,
    holidayKey: row.holiday_key,
    holidayName: row.holiday_name,
    holidayDate: row.holiday_date,
    isPaid: row.is_paid,
    countsTowardAnnualLeave: row.counts_toward_annual_leave,
    active: row.active,
    notes: row.notes,
  }))

  const assignedCompanyHolidayIds = (assignmentData || []).map((row) => row.company_holiday_id)
  const recommendedAssignedCompanyHolidayIds = companyCalendar
    .filter((item) => item.active && item.isPaid && item.countsTowardAnnualLeave)
    .slice(0, 4)
    .map((item) => item.id)

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (
      error.code === '42P01' ||
      error.code === '42703' ||
      message.includes('does not exist') ||
      message.includes('relation') ||
      message.includes('column')
    ) {
      return apiOk({
        supported: false,
        policy: null,
        recommendedPolicy,
        companyCalendar,
        assignedCompanyHolidayIds,
        recommendedAssignedCompanyHolidayIds,
        message: 'Policy table is not available yet. Run latest migration first.',
      })
    }

    return apiError(error.message || 'Failed to load employee policy', 500)
  }

  if (!data)
    return apiOk({
      supported: true,
      policy: null,
      recommendedPolicy,
      companyCalendar,
      assignedCompanyHolidayIds,
      recommendedAssignedCompanyHolidayIds,
    })

  return apiOk({
    supported: true,
    recommendedPolicy,
    companyCalendar,
    assignedCompanyHolidayIds,
    recommendedAssignedCompanyHolidayIds,
    policy: {
      employeeId: data.employee_id,
      sickPayMode: data.sick_pay_mode,
      sspEligibility: data.ssp_eligibility,
      sspWeeklyRate: data.ssp_weekly_rate,
      sspMaxWeeks: data.ssp_max_weeks,
      sspRateMode: data.ssp_rate_mode,
      paidBreakMinutesPerShift: data.paid_break_minutes_per_shift,
      holidayEntitlementDays: data.holiday_entitlement_days,
      companyPaidHolidayDays: data.company_paid_holiday_days,
      companyUnpaidHolidayDays: data.company_unpaid_holiday_days,
      bankHolidaysIncluded: data.bank_holidays_included,
      pensionStatus: data.pension_status,
      pensionProviderName: data.pension_provider_name,
      pensionEnrolmentDate: data.pension_enrolment_date,
      leaveAccrualMode: data.leave_accrual_mode,
      leaveAccruedDays: data.leave_accrued_days,
      leaveAccrualAsOf: data.leave_accrual_as_of,
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
  const sspMaxWeeks = toNumberOrNull(body.sspMaxWeeks)
  const sspRateMode = body.sspRateMode ? String(body.sspRateMode).trim() : null
  const overtimeMode = body.overtimeMode ? String(body.overtimeMode).trim() : null
  const paidBreakMinutesPerShift = toNumberOrNull(body.paidBreakMinutesPerShift)
  const holidayEntitlementDays = toNumberOrNull(body.holidayEntitlementDays)
  const companyPaidHolidayDays = toNumberOrNull(body.companyPaidHolidayDays)
  const companyUnpaidHolidayDays = toNumberOrNull(body.companyUnpaidHolidayDays)
  const pensionStatus = body.pensionStatus ? String(body.pensionStatus).trim() : null
  const pensionProviderName = body.pensionProviderName ? String(body.pensionProviderName).trim() : null
  const pensionEnrolmentDate = toIsoDateOrNull(body.pensionEnrolmentDate)
  const leaveAccrualMode = body.leaveAccrualMode ? String(body.leaveAccrualMode).trim() : null
  const leaveAccruedDays = toNumberOrNull(body.leaveAccruedDays)
  const leaveAccrualAsOf = toIsoDateOrNull(body.leaveAccrualAsOf)
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

  if (sspRateMode && !ALLOWED_SSP_RATE_MODE.includes(sspRateMode as (typeof ALLOWED_SSP_RATE_MODE)[number])) {
    return apiError('Invalid SSP rate mode', 400)
  }

  if (pensionStatus && !ALLOWED_PENSION_STATUS.includes(pensionStatus as (typeof ALLOWED_PENSION_STATUS)[number])) {
    return apiError('Invalid pension status value', 400)
  }

  if (!ALLOWED_POLICY_SOURCE.includes(policySource as (typeof ALLOWED_POLICY_SOURCE)[number])) {
    return apiError('Invalid policy source', 400)
  }

  if (
    leaveAccrualMode &&
    !ALLOWED_LEAVE_ACCRUAL_MODE.includes(
      leaveAccrualMode as (typeof ALLOWED_LEAVE_ACCRUAL_MODE)[number],
    )
  ) {
    return apiError('Invalid leave accrual mode', 400)
  }

  if (sspWeeklyRate !== null && sspWeeklyRate < 0) {
    return apiError('SSP weekly rate cannot be negative', 400)
  }

  if (sspMaxWeeks !== null && (sspMaxWeeks <= 0 || sspMaxWeeks > 28)) {
    return apiError('SSP max weeks must be between 1 and 28', 400)
  }

  if (paidBreakMinutesPerShift !== null && paidBreakMinutesPerShift < 0) {
    return apiError('Paid break minutes cannot be negative', 400)
  }

  if (holidayEntitlementDays !== null && holidayEntitlementDays < 0) {
    return apiError('Holiday entitlement cannot be negative', 400)
  }

  if (companyPaidHolidayDays !== null && companyPaidHolidayDays < 0) {
    return apiError('Company paid holiday days cannot be negative', 400)
  }

  if (companyUnpaidHolidayDays !== null && companyUnpaidHolidayDays < 0) {
    return apiError('Company unpaid holiday days cannot be negative', 400)
  }

  if (
    holidayEntitlementDays !== null &&
    companyPaidHolidayDays !== null &&
    companyPaidHolidayDays > holidayEntitlementDays
  ) {
    return apiError('Company paid holiday days cannot exceed annual leave entitlement', 400)
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

  if (leaveAccruedDays !== null && leaveAccruedDays < 0) {
    return apiError('Accrued leave days cannot be negative', 400)
  }

  if (body.effectiveFrom && !effectiveFrom) {
    return apiError('Invalid policy effective-from date', 400)
  }

  if (body.pensionEnrolmentDate && !pensionEnrolmentDate) {
    return apiError('Invalid pension enrolment date', 400)
  }

  if (body.leaveAccrualAsOf && !leaveAccrualAsOf) {
    return apiError('Invalid leave accrual as-of date', 400)
  }

  const supabase = getSupabaseClient()

  if (Array.isArray(body.companyCalendarEntries)) {
    const updates = body.companyCalendarEntries
      .map((entry) => {
        const id = String(entry.id || '').trim()
        if (!id) return null

        const holidayDate =
          entry.holidayDate === null || entry.holidayDate === undefined
            ? null
            : toIsoDateOrNull(entry.holidayDate)

        if (entry.holidayDate && !holidayDate) {
          throw new Error('Invalid company holiday date')
        }

        return {
          id,
          holiday_date: holidayDate,
          is_paid: typeof entry.isPaid === 'boolean' ? entry.isPaid : undefined,
          counts_toward_annual_leave:
            typeof entry.countsTowardAnnualLeave === 'boolean'
              ? entry.countsTowardAnnualLeave
              : undefined,
          notes: entry.notes === undefined ? undefined : entry.notes,
          active: typeof entry.active === 'boolean' ? entry.active : undefined,
          updated_at: new Date().toISOString(),
        }
      })
      .filter((row): row is Exclude<typeof row, null> => Boolean(row))

    if (updates.length > 0) {
      const { error: calendarError } = await supabase
        .from('company_holiday_calendar')
        .upsert(updates, { onConflict: 'id' })

      if (calendarError) {
        return apiError(calendarError.message || 'Failed to update company holiday calendar', 400)
      }
    }
  }
  const payload = {
    employee_id: normalizedEmployeeId,
    sick_pay_mode: sickPayMode,
    ssp_eligibility: sspEligibility,
    ssp_weekly_rate: sspWeeklyRate,
    ssp_max_weeks: sspMaxWeeks,
    ssp_rate_mode: sspRateMode,
    paid_break_minutes_per_shift: paidBreakMinutesPerShift,
    holiday_entitlement_days: holidayEntitlementDays,
    company_paid_holiday_days: companyPaidHolidayDays,
    company_unpaid_holiday_days: companyUnpaidHolidayDays,
    bank_holidays_included:
      typeof body.bankHolidaysIncluded === 'boolean' ? body.bankHolidaysIncluded : null,
    pension_status: pensionStatus,
    pension_provider_name: pensionProviderName,
    pension_enrolment_date: pensionEnrolmentDate,
    leave_accrual_mode: leaveAccrualMode,
    leave_accrued_days: leaveAccruedDays,
    leave_accrual_as_of: leaveAccrualAsOf,
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
      'employee_id, sick_pay_mode, ssp_eligibility, ssp_weekly_rate, ssp_max_weeks, ssp_rate_mode, paid_break_minutes_per_shift, holiday_entitlement_days, company_paid_holiday_days, company_unpaid_holiday_days, bank_holidays_included, pension_status, pension_provider_name, pension_enrolment_date, leave_accrual_mode, leave_accrued_days, leave_accrual_as_of, overtime_mode, overtime_threshold_hours, overtime_rate_multiplier, effective_from, notes, policy_source, policy_contract_type',
    )
    .maybeSingle()

  if (Array.isArray(body.assignedCompanyHolidayIds)) {
    const normalizedIds = body.assignedCompanyHolidayIds
      .map((id) => String(id || '').trim())
      .filter(Boolean)

    const { error: deleteAssignmentsError } = await supabase
      .from('employee_company_holiday_assignments')
      .delete()
      .eq('employee_id', normalizedEmployeeId)

    if (deleteAssignmentsError) {
      return apiError(deleteAssignmentsError.message || 'Failed to update company holiday assignments', 400)
    }

    if (normalizedIds.length > 0) {
      const rows = normalizedIds.map((calendarId) => ({
        employee_id: normalizedEmployeeId,
        company_holiday_id: calendarId,
      }))

      const { error: insertAssignmentsError } = await supabase
        .from('employee_company_holiday_assignments')
        .insert(rows)

      if (insertAssignmentsError) {
        return apiError(insertAssignmentsError.message || 'Failed to save company holiday assignments', 400)
      }
    }
  }

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
      sspMaxWeeks: data?.ssp_max_weeks,
      sspRateMode: data?.ssp_rate_mode,
      paidBreakMinutesPerShift: data?.paid_break_minutes_per_shift,
      holidayEntitlementDays: data?.holiday_entitlement_days,
      companyPaidHolidayDays: data?.company_paid_holiday_days,
      companyUnpaidHolidayDays: data?.company_unpaid_holiday_days,
      bankHolidaysIncluded: data?.bank_holidays_included,
      pensionStatus: data?.pension_status,
      pensionProviderName: data?.pension_provider_name,
      pensionEnrolmentDate: data?.pension_enrolment_date,
      leaveAccrualMode: data?.leave_accrual_mode,
      leaveAccruedDays: data?.leave_accrued_days,
      leaveAccrualAsOf: data?.leave_accrual_as_of,
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
