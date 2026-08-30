import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import { COMMISSION_PRIVATE_RESPONSE, hasCommissionCapability } from '@/lib/commissions/api'
import {
  COMMISSION_PROFILE_CAPABILITY_VERSION,
  commissionProfileSchema,
  profileNeedsWholeMonths,
  toStoredCommissionProfile,
} from '@/lib/commissions/contracts'
import { requireCommissionManager } from '@/lib/commissions/server'
import type { Json } from '@/types/supabase'

function requestToken(request: Request) {
  const supplied = request.headers.get('Idempotency-Key')?.trim()
  return supplied && /^[A-Za-z0-9:_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID()
}

function databaseStatus(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || '')
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === '23P01' || code === '23505') return 409
  if (code === '55000') return 409
  if (code === '22023' || code === '23514') return 400
  if (code === '42P01' || code === '42883' || code === 'PGRST202') return 503
  return 500
}

export async function POST(request: Request) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability(COMMISSION_PROFILE_CAPABILITY_VERSION))) {
    return apiError(
      'The latest employee commission profile capability is not installed on this database',
      503,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }

  const {
    data: profile,
    error: bodyError,
    issues,
  } = await parseBodyWithSchema(request, commissionProfileSchema, { maxBytes: 64 * 1024 })
  if (bodyError || !profile) {
    return apiError(
      bodyError || 'Invalid commission profile',
      400,
      {
        issues: (issues || []).map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
  if (profileNeedsWholeMonths(profile) && !profile.effectiveFrom.endsWith('-01')) {
    return apiError(
      'Tiered rates, monthly bonuses, salary, and PKR plans must start on the first of a month',
      400,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }

  if (profile.assistanceScope.mode === 'specific_agents') {
    const { data: selectedAgents, error: selectedAgentsError } = await access.supabase
      .from('employees')
      .select('id, is_active')
      .in('id', profile.assistanceScope.employeeIds)
    if (selectedAgentsError) {
      return apiError(
        'Unable to validate selected primary agents',
        500,
        {},
        COMMISSION_PRIVATE_RESPONSE,
      )
    }
    if (
      selectedAgents.length !== profile.assistanceScope.employeeIds.length ||
      selectedAgents.some((employee) => !employee.is_active)
    ) {
      return apiError(
        'Ticket Assistance can target only active employees',
        400,
        {},
        COMMISSION_PRIVATE_RESPONSE,
      )
    }
  }

  const token = requestToken(request)
  const configuration = JSON.parse(JSON.stringify(toStoredCommissionProfile(profile))) as Json

  try {
    const { data, error } = await access.supabase.rpc(
      'commission_create_employee_profile_2026082904',
      {
        p_actor_employee_id: access.employee.id,
        p_employee_id: profile.employeeId,
        p_label: profile.label,
        p_effective_from: profile.effectiveFrom,
        p_location_id: profile.locationId,
        p_copied_from_profile_id: profile.copiedFromProfileId,
        p_configuration: configuration,
        p_change_reason: profile.changeReason,
        p_request_key: `profile:${token}`,
      },
    )
    if (error) throw error

    let calculation: Json | null = null
    let calculationWarning: string | null = null
    const today = new Date().toISOString().slice(0, 10)
    if (profile.effectiveFrom <= today) {
      const processResult = await access.supabase.rpc('commission_process_shadow_2026082902', {
        p_actor_employee_id: access.employee.id,
        p_limit: 200,
        p_request_key: `profile-process:${token}`,
      })
      calculation = processResult.data
      calculationWarning = processResult.error
        ? toErrorMessage(processResult.error, 'Profile saved, but calculation is still queued')
        : null
    }

    return apiOk(
      {
        profile: data,
        calculation,
        calculationWarning,
      },
      { ...COMMISSION_PRIVATE_RESPONSE, status: 201 },
    )
  } catch (error) {
    const message = toErrorMessage(error, 'Unable to save employee commission profile')
    console.error('[commission] employee-profile save failed', {
      code: (error as { code?: string } | null)?.code,
      hint: (error as { hint?: string } | null)?.hint,
      details: (error as { details?: string } | null)?.details,
    })
    return apiError(
      message,
      databaseStatus(error),
      { issues: [{ path: 'commissionPlan', message }] },
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}
