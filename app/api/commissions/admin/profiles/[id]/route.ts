import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import { COMMISSION_PRIVATE_RESPONSE, hasCommissionCapability } from '@/lib/commissions/api'
import {
  COMMISSION_APPLICATION_CAPABILITY_VERSION,
  COMMISSION_PROFILE_EDITING_CAPABILITY_VERSION,
  commissionProfileSchema,
  profileNeedsWholeMonths,
  toStoredCommissionProfile,
} from '@/lib/commissions/contracts'
import { requireCommissionManager } from '@/lib/commissions/server'
import type { Json } from '@/types/supabase'

const removalSchema = z.object({ reason: z.string().trim().min(8).max(480) }).strict()

function validId(id: string) {
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)
}

function requestToken(request: Request) {
  const supplied = request.headers.get('Idempotency-Key')?.trim()
  return supplied && /^[A-Za-z0-9:_-]{8,80}$/.test(supplied) ? supplied : crypto.randomUUID()
}

function databaseStatus(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || '')
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === '23P01' || code === '23505' || code === '55000') return 409
  if (code === '22023' || code === '23514') return 400
  if (code === '42P01' || code === '42883' || code === 'PGRST202') return 503
  return 500
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability(COMMISSION_PROFILE_EDITING_CAPABILITY_VERSION))) {
    return apiError(
      'The latest Commission plan editing capability is not installed',
      503,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }

  const { id } = await context.params
  if (!validId(id)) return apiError('Invalid profile ID', 400, {}, COMMISSION_PRIVATE_RESPONSE)
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
      'Monthly ticket tiers, monthly bonuses, salary, and PKR plans must start on the first of a month',
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
    if (selectedAgentsError)
      return apiError(
        'Unable to validate selected primary agents',
        500,
        {},
        COMMISSION_PRIVATE_RESPONSE,
      )
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
  if (profile.applicationRouting.mode === 'another_employee') {
    const { data: recipient, error: recipientError } = await access.supabase
      .from('employees')
      .select('id, is_active')
      .eq('id', profile.applicationRouting.recipientEmployeeId as string)
      .maybeSingle()
    if (recipientError)
      return apiError(
        'Unable to validate the Application commission recipient',
        500,
        {},
        COMMISSION_PRIVATE_RESPONSE,
      )
    if (!recipient?.is_active) {
      return apiError(
        'Application commission can be redirected only to an active employee',
        400,
        {},
        COMMISSION_PRIVATE_RESPONSE,
      )
    }
  }

  const token = requestToken(request)
  try {
    const { data, error } = await access.supabase.rpc(
      'commission_replace_employee_profile_2026083008',
      {
        p_actor_employee_id: access.employee.id,
        p_profile_id: id,
        p_label: profile.label,
        p_effective_from: profile.effectiveFrom,
        p_location_id: profile.locationId,
        p_configuration: JSON.parse(JSON.stringify(toStoredCommissionProfile(profile))) as Json,
        p_change_reason: profile.changeReason,
        p_request_key: `profile-replace:${token}`,
      },
    )
    if (error) throw error
    const processResult = await access.supabase.rpc('commission_process_shadow_2026082902', {
      p_actor_employee_id: access.employee.id,
      p_limit: 200,
      p_request_key: `profile-replace-process:${token}`,
    })
    return apiOk(
      {
        profile: data,
        calculation: processResult.data,
        calculationWarning: processResult.error ? toErrorMessage(processResult.error) : null,
      },
      COMMISSION_PRIVATE_RESPONSE,
    )
  } catch (error) {
    const message = toErrorMessage(error, 'Unable to overwrite employee commission profile')
    return apiError(
      message,
      databaseStatus(error),
      { issues: [{ path: 'commissionPlan', message }] },
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await requireCommissionManager()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability(COMMISSION_APPLICATION_CAPABILITY_VERSION))) {
    return apiError(
      'The latest Commission plan deletion capability is not installed',
      503,
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }

  const { id } = await context.params
  if (!validId(id)) return apiError('Invalid profile ID', 400, {}, COMMISSION_PRIVATE_RESPONSE)
  const { data: removal, error: bodyError } = await parseBodyWithSchema(request, removalSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !removal)
    return apiError(bodyError || 'Enter a deletion reason', 400, {}, COMMISSION_PRIVATE_RESPONSE)

  try {
    const { data, error } = await access.supabase.rpc(
      'commission_remove_employee_profile_2026083006',
      {
        p_actor_employee_id: access.employee.id,
        p_profile_id: id,
        p_reason: removal.reason,
        p_request_key: `profile-remove:${requestToken(request)}`,
      },
    )
    if (error) throw error
    return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
  } catch (error) {
    return apiError(
      toErrorMessage(error, 'Unable to remove commission profile'),
      databaseStatus(error),
      {},
      COMMISSION_PRIVATE_RESPONSE,
    )
  }
}
