import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type PayrollBody = {
  payBasis?: string | null
  hourlySource?: string | null
  hourlyRate?: number | null
  annualSalary?: number | null
  workingHoursPerWeek?: number | null
  salaryCurrency?: string | null
  payrollEffectiveFrom?: string | null
  employmentType?: string | null
  employmentStartDate?: string | null
  employmentEndDate?: string | null
  payrollNotes?: string | null
}

const ALLOWED_EMPLOYMENT_TYPES = ['permanent', 'fixed-term', 'part-time', 'contractor'] as const
const ALLOWED_PAY_BASIS = ['salaried', 'hourly'] as const
const ALLOWED_HOURLY_SOURCE = ['contracted', 'timeclock'] as const

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

  const payBasis = body.payBasis ? String(body.payBasis).trim() : 'salaried'
  const hourlySource = body.hourlySource ? String(body.hourlySource).trim() : null

  const hourlyRate = toNumberOrNull(body.hourlyRate)
  const annualSalary = toNumberOrNull(body.annualSalary)
  const workingHoursPerWeek = toNumberOrNull(body.workingHoursPerWeek)
  const salaryCurrency = normalizeCurrency(body.salaryCurrency)
  const payrollEffectiveFrom = toIsoDateOrNull(body.payrollEffectiveFrom)
  const employmentType = body.employmentType ? String(body.employmentType).trim() : null
  const employmentStartDate = toIsoDateOrNull(body.employmentStartDate)
  const employmentEndDate = toIsoDateOrNull(body.employmentEndDate)
  const payrollNotes = body.payrollNotes ? String(body.payrollNotes).trim() : null

  if (!ALLOWED_PAY_BASIS.includes(payBasis as (typeof ALLOWED_PAY_BASIS)[number])) {
    return apiError('Invalid pay basis', 400)
  }

  if (hourlySource && !ALLOWED_HOURLY_SOURCE.includes(hourlySource as (typeof ALLOWED_HOURLY_SOURCE)[number])) {
    return apiError('Invalid hourly source', 400)
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

  if (employmentStartDate && employmentEndDate && employmentEndDate < employmentStartDate) {
    return apiError('Employment end date cannot be before start date', 400)
  }

  const updatePayload = {
    pay_basis: payBasis,
    hourly_source: payBasis === 'hourly' ? hourlySource : null,
    hourly_rate: hourlyRate,
    annual_salary: annualSalary,
    working_hours_per_week: workingHoursPerWeek,
    salary_currency: salaryCurrency,
    payroll_effective_from: payrollEffectiveFrom,
    employment_type: employmentType,
    employment_start_date: employmentStartDate,
    employment_end_date: employmentEndDate,
    payroll_notes: payrollNotes,
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('employees')
    .update(updatePayload)
    .eq('id', normalizedEmployeeId)
    .select(
      'id, pay_basis, hourly_source, hourly_rate, annual_salary, working_hours_per_week, salary_currency, payroll_effective_from, employment_type, employment_start_date, employment_end_date, payroll_notes',
    )
    .maybeSingle()

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (error.code === '42703' || message.includes('column')) {
      return apiError('Payroll columns are not available yet. Run latest migration first.', 400)
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
      hourlyRate: data.hourly_rate,
      annualSalary: data.annual_salary,
      workingHoursPerWeek: data.working_hours_per_week,
      salaryCurrency: data.salary_currency,
      payrollEffectiveFrom: data.payroll_effective_from,
      employmentType: data.employment_type,
      employmentStartDate: data.employment_start_date,
      employmentEndDate: data.employment_end_date,
      payrollNotes: data.payroll_notes,
    },
  })
}
