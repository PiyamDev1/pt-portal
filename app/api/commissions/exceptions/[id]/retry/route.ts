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
import { commissionIdParamSchema, commissionRetrySchema } from '@/lib/commissions/contracts'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  const access = await requireCommissionPolicyAccess()
  if (!access.authorized) return access.response
  if (!(await hasCommissionCapability())) {
    return commissionError('Commission shadow processing is not installed on this database.', 503)
  }
  const params = commissionIdParamSchema.safeParse(await context.params)
  if (!params.success) return commissionError('Invalid Commission exception.', 400)
  const requestKey = readIdempotencyKey(request)
  if (!requestKey) return commissionError('A valid Idempotency-Key header is required.', 400)
  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    commissionRetrySchema,
    { maxBytes: 256 },
  )
  if (bodyError || !input) return commissionError('The retry body must be empty.', 400)

  const { data, error } = await getServiceSupabaseClient().rpc(
    'commission_retry_exception_2026082902',
    {
      p_actor_employee_id: access.employee.id,
      p_exception_id: params.data.id,
      p_request_key: requestKey,
    },
  )
  if (error) {
    const safe = publicCommissionDatabaseError(error)
    return commissionError(safe.message, safe.status)
  }
  return apiOk(data, COMMISSION_PRIVATE_RESPONSE)
}
