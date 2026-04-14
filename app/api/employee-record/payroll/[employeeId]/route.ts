import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type PayrollBody = {
  hourlyRate?: number | null
  annualSalary?: number | null
  workingHoursPerWeek?: number | null
  employmentType?: string | null
  employmentStartDate?: string | null
  employmentEndDate?: string | null
  payrollNotes?: string | null
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
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

  const updatePayload = {
    hourly_rate: toNumberOrNull(body.hourlyRate),
    annual_salary: toNumberOrNull(body.annualSalary),
    working_hours_per_week: toNumberOrNull(body.workingHoursPerWeek),
    employment_type: body.employmentType ? String(body.employmentType).trim() : null,
    employment_start_date: body.employmentStartDate || null,
    employment_end_date: body.employmentEndDate || null,
    payroll_notes: body.payrollNotes ? String(body.payrollNotes).trim() : null,
  }

  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('employees')
    .update(updatePayload)
    .eq('id', normalizedEmployeeId)
    .select(
      'id, hourly_rate, annual_salary, working_hours_per_week, employment_type, employment_start_date, employment_end_date, payroll_notes',
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
      hourlyRate: data.hourly_rate,
      annualSalary: data.annual_salary,
      workingHoursPerWeek: data.working_hours_per_week,
      employmentType: data.employment_type,
      employmentStartDate: data.employment_start_date,
      employmentEndDate: data.employment_end_date,
      payrollNotes: data.payroll_notes,
    },
  })
}
