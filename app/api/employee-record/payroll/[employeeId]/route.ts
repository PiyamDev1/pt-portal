import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type PayrollBody = {
  payBasis?: string | null
  hourlySource?: string | null
  workPattern?: string | null
  hourlyRate?: number | null
  annualSalary?: number | null
  workingHoursPerWeek?: number | null
  workSchedule?: Array<{
    day?: string | null
    enabled?: boolean | null
    startTime?: string | null
    endTime?: string | null
  }> | null
  statutoryBreakPaid?: boolean | null
  companyLunchBreakMinutes?: number | null
  companyLunchBreakPaid?: boolean | null
  salaryCurrency?: string | null
  payrollEffectiveFrom?: string | null
  employmentType?: string | null
  employmentStartDate?: string | null
  employmentEndDate?: string | null
  workStartTime?: string | null
  workEndTime?: string | null
  nationalInsuranceNumber?: string | null
  payrollNotes?: string | null
}

const ALLOWED_EMPLOYMENT_TYPES = ['permanent', 'fixed-term', 'part-time', 'contractor'] as const
const ALLOWED_PAY_BASIS = ['salaried', 'hourly'] as const
const ALLOWED_HOURLY_SOURCE = ['contracted', 'timeclock'] as const
const ALLOWED_WORK_PATTERNS = ['fixed', 'flexible', 'on-call'] as const
const ALLOWED_WORK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

type WorkScheduleRow = {
  day: (typeof ALLOWED_WORK_DAYS)[number]
  enabled: boolean
  startTime: string | null
  endTime: string | null
}

function normalizePayBasis(value: unknown): 'salaried' | 'hourly' | null {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'salaried'

  if (['salaried', 'salary', 'annual', 'fixed', 'fixed-salary'].includes(raw)) return 'salaried'
  if (['hourly', 'hours', 'timeclock'].includes(raw)) return 'hourly'

  return null
}

function normalizeHourlySource(value: unknown): 'contracted' | 'timeclock' | null {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return null

  if (['contracted', 'contract', 'scheduled'].includes(raw)) return 'contracted'
  if (['timeclock', 'clock', 'clocked'].includes(raw)) return 'timeclock'

  return null
}

function normalizeWorkPattern(value: unknown): 'fixed' | 'flexible' | 'on-call' | null {
  const raw = String(value || '').trim().toLowerCase()
  if (!raw) return 'fixed'

  if (raw === 'fixed') return 'fixed'
  if (raw === 'flexible') return 'flexible'
  if (raw === 'on-call' || raw === 'oncall' || raw === 'on call') return 'on-call'

  return null
}

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

function normalizeCurrency(value: unknown) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return 'GBP'
  if (raw.length !== 3) return null
  return raw
}

function normalizeTimeOrNull(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) return null
  return raw
}

function normalizeNationalInsuranceNumber(value: unknown) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!raw) return null

  // Basic UK NINO shape validation: AA999999A (suffix A-D)
  const ninoRegex = /^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/
  if (!ninoRegex.test(raw)) return null

  return raw
}

function toMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours * 60 + minutes
}

function roundTo2(value: number) {
  return Math.round(value * 100) / 100
}

function normalizeWorkSchedule(value: PayrollBody['workSchedule']) {
  if (!Array.isArray(value)) return [] as WorkScheduleRow[]

  const normalized: WorkScheduleRow[] = []
  for (const row of value) {
    const day = String(row?.day || '').trim().toLowerCase()
    if (!ALLOWED_WORK_DAYS.includes(day as (typeof ALLOWED_WORK_DAYS)[number])) continue

    const startTime = normalizeTimeOrNull(row?.startTime)
    const endTime = normalizeTimeOrNull(row?.endTime)
    normalized.push({
      day: day as (typeof ALLOWED_WORK_DAYS)[number],
      enabled: Boolean(row?.enabled),
      startTime,
      endTime,
    })
  }

  return normalized.sort(
    (left, right) => ALLOWED_WORK_DAYS.indexOf(left.day) - ALLOWED_WORK_DAYS.indexOf(right.day),
  )
}

function calculatePayableHours(
  schedule: WorkScheduleRow[],
  statutoryBreakPaid: boolean,
  companyLunchBreakMinutes: number,
  companyLunchBreakPaid: boolean,
) {
  let payableHours = 0

  for (const day of schedule) {
    if (!day.enabled || !day.startTime || !day.endTime) continue
    const start = toMinutes(day.startTime)
    const end = toMinutes(day.endTime)
    if (start === null || end === null || end <= start) continue

    const grossHours = (end - start) / 60
    let netHours = grossHours

    if (grossHours > 6 && !statutoryBreakPaid) {
      netHours -= 20 / 60
    }

    if (companyLunchBreakMinutes > 0 && !companyLunchBreakPaid) {
      netHours -= companyLunchBreakMinutes / 60
    }

    payableHours += Math.max(0, netHours)
  }

  return roundTo2(payableHours)
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ employeeId: string }> },
) {
  const auth = await requireAdminSession()
  if (!auth.authorized) return auth.response

  const { employeeId } = await context.params
  const normalizedEmployeeId = String(employeeId || '').trim()
  if (!normalizedEmployeeId) {
    return apiError('employeeId is required', 400)
  }

  const body = (await request.json().catch(() => ({}))) as PayrollBody

  const payBasis = normalizePayBasis(body.payBasis)
  const hourlySource = normalizeHourlySource(body.hourlySource)
  const workPattern = normalizeWorkPattern(body.workPattern)

  const hourlyRate = toNumberOrNull(body.hourlyRate)
  const annualSalary = toNumberOrNull(body.annualSalary)
  const statutoryBreakPaid = Boolean(body.statutoryBreakPaid ?? false)
  const companyLunchBreakMinutes = toNumberOrNull(body.companyLunchBreakMinutes)
  const companyLunchBreakPaid = Boolean(body.companyLunchBreakPaid ?? false)
  const workSchedule = normalizeWorkSchedule(body.workSchedule)
  const derivedWorkingHoursPerWeek = calculatePayableHours(
    workSchedule,
    statutoryBreakPaid,
    companyLunchBreakMinutes !== null && companyLunchBreakMinutes > 0 ? companyLunchBreakMinutes : 0,
    companyLunchBreakPaid,
  )
  const workingHoursPerWeek =
    workPattern === 'fixed'
      ? (workSchedule.length > 0 ? derivedWorkingHoursPerWeek : toNumberOrNull(body.workingHoursPerWeek))
      : toNumberOrNull(body.workingHoursPerWeek)
  const salaryCurrency = normalizeCurrency(body.salaryCurrency)
  const payrollEffectiveFrom = toIsoDateOrNull(body.payrollEffectiveFrom)
  const employmentType = body.employmentType ? String(body.employmentType).trim() : null
  const employmentStartDate = toIsoDateOrNull(body.employmentStartDate)
  const employmentEndDate = toIsoDateOrNull(body.employmentEndDate)
  const workStartTime = normalizeTimeOrNull(body.workStartTime)
  const workEndTime = normalizeTimeOrNull(body.workEndTime)
  const nationalInsuranceNumber = normalizeNationalInsuranceNumber(body.nationalInsuranceNumber)
  const payrollNotes = body.payrollNotes ? String(body.payrollNotes).trim() : null

  if (!payBasis || !ALLOWED_PAY_BASIS.includes(payBasis as (typeof ALLOWED_PAY_BASIS)[number])) {
    return apiError(
      "Invalid base pay type. Choose 'Salaried (Annual)' or 'Hourly' in HR Setup, then save again.",
      400,
    )
  }

  if (hourlySource && !ALLOWED_HOURLY_SOURCE.includes(hourlySource as (typeof ALLOWED_HOURLY_SOURCE)[number])) {
    return apiError('Invalid hourly source', 400)
  }

  if (!workPattern || !ALLOWED_WORK_PATTERNS.includes(workPattern as (typeof ALLOWED_WORK_PATTERNS)[number])) {
    return apiError('Invalid work pattern', 400)
  }

  if (!salaryCurrency) {
    return apiError('Invalid salary currency', 400)
  }

  if (body.payrollEffectiveFrom && !payrollEffectiveFrom) {
    return apiError('Invalid payroll effective-from date', 400)
  }

  if (hourlyRate !== null && hourlyRate < 0) {
    return apiError('Hourly rate cannot be negative', 400)
  }

  if (annualSalary !== null && annualSalary < 0) {
    return apiError('Annual salary cannot be negative', 400)
  }

  if (workingHoursPerWeek !== null && (workingHoursPerWeek < 0 || workingHoursPerWeek > 168)) {
    return apiError('Working hours per week must be between 0 and 168', 400)
  }

  if (companyLunchBreakMinutes !== null && (companyLunchBreakMinutes < 0 || companyLunchBreakMinutes > 180)) {
    return apiError('Company lunch break must be between 0 and 180 minutes', 400)
  }

  if (payBasis === 'salaried' && annualSalary === null) {
    return apiError('Annual salary is required for salaried employees', 400)
  }

  if (payBasis === 'hourly' && hourlyRate === null) {
    return apiError('Hourly rate is required for hourly employees', 400)
  }

  if (payBasis === 'hourly' && hourlySource === null) {
    return apiError('Hourly source is required for hourly employees', 400)
  }

  if (employmentType && !ALLOWED_EMPLOYMENT_TYPES.includes(employmentType as (typeof ALLOWED_EMPLOYMENT_TYPES)[number])) {
    return apiError('Invalid employment type', 400)
  }

  if (body.employmentStartDate && !employmentStartDate) {
    return apiError('Invalid employment start date', 400)
  }

  if (body.employmentEndDate && !employmentEndDate) {
    return apiError('Invalid employment end date', 400)
  }

  if (body.workStartTime && !workStartTime) {
    return apiError('Invalid work start time (use HH:MM)', 400)
  }

  if (body.workEndTime && !workEndTime) {
    return apiError('Invalid work end time (use HH:MM)', 400)
  }

  if (body.nationalInsuranceNumber && !nationalInsuranceNumber) {
    return apiError('Invalid National Insurance number format (example: QQ123456C)', 400)
  }

  if (employmentStartDate && employmentEndDate && employmentEndDate < employmentStartDate) {
    return apiError('Employment end date cannot be before start date', 400)
  }

  if (workStartTime && workEndTime && workEndTime <= workStartTime) {
    return apiError('Work finish time must be after start time', 400)
  }

  if (workPattern === 'fixed') {
    for (const row of workSchedule) {
      if (!row.enabled) continue
      if (!row.startTime || !row.endTime) {
        return apiError(`Each enabled work day must have a start and finish time`, 400)
      }
      if (row.endTime <= row.startTime) {
        return apiError(`Each enabled work day must finish after it starts`, 400)
      }
    }
  }

  const firstEnabledDay =
    workPattern === 'fixed'
      ? workSchedule.find((row) => row.enabled && row.startTime && row.endTime)
      : null

  const updatePayload = {
    pay_basis: payBasis,
    hourly_source: payBasis === 'hourly' ? hourlySource : null,
    work_pattern: workPattern,
    hourly_rate: hourlyRate,
    annual_salary: annualSalary,
    working_hours_per_week: workingHoursPerWeek,
    work_schedule: workPattern === 'fixed' ? workSchedule : null,
    statutory_break_paid: statutoryBreakPaid,
    company_lunch_break_minutes: companyLunchBreakMinutes,
    company_lunch_break_paid: companyLunchBreakPaid,
    salary_currency: salaryCurrency,
    payroll_effective_from: payrollEffectiveFrom,
    employment_type: employmentType,
    employment_start_date: employmentStartDate,
    employment_end_date: employmentEndDate,
    work_start_time: firstEnabledDay?.startTime ?? workStartTime,
    work_end_time: firstEnabledDay?.endTime ?? workEndTime,
    national_insurance_number: nationalInsuranceNumber,
    payroll_notes: payrollNotes,
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('employees')
    .update(updatePayload)
    .eq('id', normalizedEmployeeId)
    .select(
      'id, pay_basis, hourly_source, work_pattern, hourly_rate, annual_salary, working_hours_per_week, work_schedule, statutory_break_paid, company_lunch_break_minutes, company_lunch_break_paid, salary_currency, payroll_effective_from, employment_type, employment_start_date, employment_end_date, work_start_time, work_end_time, national_insurance_number, payroll_notes',
    )
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (error.code === '42703' || message.includes('column')) {
      return apiError('Payroll columns are not available yet. Run latest migration first.', 400)
    }

    if (error.code === '22P02' && (message.includes('pay_basis') || message.includes('hourly_source') || message.includes('salary_currency'))) {
      return apiError(
        "A payroll column is still using a database enum type. Run migration scripts/migrations/20260416_convert_pay_basis_to_text.sql in Supabase SQL Editor to fix this, then try saving again.",
        400,
      )
    }

    return apiError(error.message || 'Failed to update payroll details', 500)
  }

  if (!data) {
    return apiError('Employee not found', 404)
  }

  return apiOk({
    employee: {
      id: data.id,
      payBasis: data.pay_basis,
      hourlySource: data.hourly_source,
      workPattern: data.work_pattern,
      hourlyRate: data.hourly_rate,
      annualSalary: data.annual_salary,
      workingHoursPerWeek: data.working_hours_per_week,
      workSchedule: data.work_schedule,
      statutoryBreakPaid: data.statutory_break_paid,
      companyLunchBreakMinutes: data.company_lunch_break_minutes,
      companyLunchBreakPaid: data.company_lunch_break_paid,
      salaryCurrency: data.salary_currency,
      payrollEffectiveFrom: data.payroll_effective_from,
      employmentType: data.employment_type,
      employmentStartDate: data.employment_start_date,
      employmentEndDate: data.employment_end_date,
      workStartTime: data.work_start_time,
      workEndTime: data.work_end_time,
      nationalInsuranceNumber: data.national_insurance_number,
      payrollNotes: data.payroll_notes,
    },
  })
}
