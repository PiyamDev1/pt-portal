import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { posPostTransactionSchema } from '@/lib/pos/inputContracts'
import { POS_PRIVATE_RESPONSE, posErrorResponse, posIdempotencyKey } from '@/lib/pos/http'
import { runPosMutation } from '@/lib/pos/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'pos.post-transaction',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const idempotencyKey = posIdempotencyKey(request)
  if (!idempotencyKey) {
    return apiError('A valid Idempotency-Key header is required.', 400, {}, POS_PRIVATE_RESPONSE)
  }
  const { data, error } = await parseBodyWithSchema(request, posPostTransactionSchema, {
    maxBytes: 32 * 1024,
  })
  if (!data || error)
    return apiError(error || 'Invalid transaction.', 400, {}, POS_PRIVATE_RESPONSE)
  try {
    const result = await runPosMutation(
      'pos_post_transaction_v7',
      access.employee.id,
      idempotencyKey,
      data,
    )
    return apiOk(result, { status: result.idempotentReplay ? 200 : 201, ...POS_PRIVATE_RESPONSE })
  } catch (mutationError) {
    return posErrorResponse(mutationError)
  }
}
