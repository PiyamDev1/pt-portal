import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { isPosManager } from '@/lib/pos/access'
import {
  posApproveCloseoutSchema,
  posCloseShiftSchema,
  posOpenShiftSchema,
} from '@/lib/pos/inputContracts'
import { POS_PRIVATE_RESPONSE, posErrorResponse, posIdempotencyKey } from '@/lib/pos/http'
import { runPosMutation } from '@/lib/pos/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const shiftActionSchema = z.discriminatedUnion('action', [
  posOpenShiftSchema.extend({ action: z.literal('OPEN') }),
  posCloseShiftSchema.extend({ action: z.literal('CLOSE') }),
  posApproveCloseoutSchema.extend({ action: z.literal('APPROVE') }),
])

export async function POST(request: Request) {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'pos.shift-mutation',
    limit: 20,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const idempotencyKey = posIdempotencyKey(request)
  if (!idempotencyKey) {
    return apiError('A valid Idempotency-Key header is required.', 400, {}, POS_PRIVATE_RESPONSE)
  }
  const { data, error } = await parseBodyWithSchema(request, shiftActionSchema, {
    maxBytes: 32 * 1024,
  })
  if (!data || error)
    return apiError(error || 'Invalid shift action.', 400, {}, POS_PRIVATE_RESPONSE)

  let functionName: 'pos_open_shift_v1' | 'pos_close_shift_v1' | 'pos_approve_closeout_v1'
  let payload: Record<string, unknown>
  if (data.action === 'APPROVE') {
    if (!isPosManager(access))
      return apiError('Manager access required.', 403, {}, POS_PRIVATE_RESPONSE)
    const verification = await verifyFreshSecondFactor({
      userId: access.user.id,
      code: data.verificationCode,
      method: data.verificationMethod,
    })
    if (!verification.verified) return apiError(verification.error, 403, {}, POS_PRIVATE_RESPONSE)
    functionName = 'pos_approve_closeout_v1'
    const {
      action: _action,
      verificationCode: _code,
      verificationMethod: _method,
      ...verified
    } = data
    void _action
    void _code
    void _method
    payload = { ...verified, freshFactorMethod: verification.method }
  } else if (data.action === 'CLOSE') {
    functionName = 'pos_close_shift_v1'
    const { action: _action, ...closeout } = data
    void _action
    payload = closeout
  } else {
    functionName = 'pos_open_shift_v1'
    const { action: _action, ...opening } = data
    void _action
    payload = opening
  }

  try {
    return apiOk(
      await runPosMutation(functionName, access.employee.id, idempotencyKey, payload),
      POS_PRIVATE_RESPONSE,
    )
  } catch (mutationError) {
    return posErrorResponse(mutationError)
  }
}
