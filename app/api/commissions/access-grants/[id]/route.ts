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
import { commissionIdParamSchema } from '@/lib/commissions/contracts'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: NextRequest, context: RouteContext) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!access.canManageGrants) return commissionError('Forbidden', 403)
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const params = commissionIdParamSchema.safeParse(await context.params)
  if (!params.success) return commissionError('Invalid Commission access grant.', 400)
  const requestKey = readIdempotencyKey(request)
  if (!requestKey) return commissionError('A valid Idempotency-Key header is required.', 400)

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_revoke_access_2026082901',
    {
      p_actor_employee_id: access.employee.id,
      p_grant_id: params.data.id,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
}
