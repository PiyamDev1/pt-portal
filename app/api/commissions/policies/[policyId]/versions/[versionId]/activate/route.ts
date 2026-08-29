import { NextRequest } from 'next/server'
import { apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
  publicCommissionDatabaseError,
  readIdempotencyKey,
} from '@/lib/commissions/api'
import {
  activateCommissionPolicyVersionSchema,
  commissionVersionParamSchema,
} from '@/lib/commissions/contracts'

type RouteContext = { params: Promise<{ policyId: string; versionId: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const params = commissionVersionParamSchema.safeParse(await context.params)
  if (!params.success) return commissionError('Invalid Commission policy version.', 400)
  const requestKey = readIdempotencyKey(request)
  if (!requestKey) return commissionError('A valid Idempotency-Key header is required.', 400)
  const parsed = activateCommissionPolicyVersionSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) return commissionError('The activation body must be empty.', 400)

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_activate_policy_version_2026082901',
    {
      p_actor_employee_id: access.employee.id,
      p_rule_id: params.data.policyId,
      p_version_id: params.data.versionId,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
}
