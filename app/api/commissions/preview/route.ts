import { NextRequest } from 'next/server'
import { apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCommissionPolicyAccess } from '@/lib/commissions/apiAuth'
import {
  COMMISSION_PRIVATE_RESPONSE,
  commissionError,
  hasCommissionCapability,
  publicCommissionDatabaseError,
  readIdempotencyKey,
} from '@/lib/commissions/api'
import { commissionPreviewSchema } from '@/lib/commissions/contracts'

export async function POST(request: NextRequest) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow mode is not installed on this database.', 503)
  }
  const requestKey = readIdempotencyKey(request)
  if (!requestKey) return commissionError('A valid Idempotency-Key header is required.', 400)
  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    commissionPreviewSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !input) {
    return commissionError(bodyError || 'Invalid Commission preview.', 400)
  }

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_preview_component_2026082901',
    {
      p_actor_employee_id: access.employee.id,
      p_component: input.component,
      p_variables: input.variables,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
}
