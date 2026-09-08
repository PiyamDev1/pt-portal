import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { POS_PRIVATE_RESPONSE, posErrorResponse, posIdempotencyKey } from '@/lib/pos/http'
import { posReconciliationSchema } from '@/lib/pos/inputContracts'
import { runPosMutation } from '@/lib/pos/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'pos.reconciliation',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const idempotencyKey = posIdempotencyKey(request)
  if (!idempotencyKey)
    return apiError('A valid Idempotency-Key header is required.', 400, {}, POS_PRIVATE_RESPONSE)
  const { data, error } = await parseBodyWithSchema(request, posReconciliationSchema, {
    maxBytes: 16 * 1024,
  })
  if (!data || error)
    return apiError(error || 'Invalid reconciliation.', 400, {}, POS_PRIVATE_RESPONSE)
  try {
    return apiOk(
      await runPosMutation(
        'pos_record_reconciliation_v1',
        access.employee.id,
        idempotencyKey,
        data,
      ),
      { status: 201, ...POS_PRIVATE_RESPONSE },
    )
  } catch (mutationError) {
    return posErrorResponse(mutationError)
  }
}
