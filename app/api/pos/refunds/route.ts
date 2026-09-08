import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { isPosManager } from '@/lib/pos/access'
import { posRefundSchema } from '@/lib/pos/inputContracts'
import { POS_PRIVATE_RESPONSE, posErrorResponse, posIdempotencyKey } from '@/lib/pos/http'
import { posRefundNeedsManager, runPosMutation } from '@/lib/pos/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'pos.refund',
    limit: 20,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const idempotencyKey = posIdempotencyKey(request)
  if (!idempotencyKey)
    return apiError('A valid Idempotency-Key header is required.', 400, {}, POS_PRIVATE_RESPONSE)
  const { data, error } = await parseBodyWithSchema(request, posRefundSchema, {
    maxBytes: 32 * 1024,
  })
  if (!data || error) return apiError(error || 'Invalid refund.', 400, {}, POS_PRIVATE_RESPONSE)

  let managerRequired: boolean
  try {
    managerRequired = await posRefundNeedsManager(data)
  } catch {
    return apiError('Unable to verify the original transaction.', 503, {}, POS_PRIVATE_RESPONSE)
  }
  let freshFactorMethod: 'totp' | 'backup' | undefined
  if (managerRequired || data.verificationCode) {
    if (!isPosManager(access))
      return apiError('Manager access required.', 403, {}, POS_PRIVATE_RESPONSE)
    const verification = await verifyFreshSecondFactor({
      userId: access.user.id,
      code: data.verificationCode,
      method: data.verificationMethod,
    })
    if (!verification.verified) return apiError(verification.error, 403, {}, POS_PRIVATE_RESPONSE)
    freshFactorMethod = verification.method
  }
  const { verificationCode: _code, verificationMethod: _method, ...payload } = data
  void _code
  void _method
  try {
    const result = await runPosMutation(
      'pos_record_refund_v1',
      access.employee.id,
      idempotencyKey,
      {
        ...payload,
        ...(freshFactorMethod ? { freshFactorMethod } : {}),
      },
    )
    return apiOk(result, { status: result.idempotentReplay ? 200 : 201, ...POS_PRIVATE_RESPONSE })
  } catch (mutationError) {
    return posErrorResponse(mutationError)
  }
}
