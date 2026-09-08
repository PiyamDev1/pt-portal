import { apiError, apiOk } from '@/lib/api/http'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { isPosManager } from '@/lib/pos/access'
import { POS_PRIVATE_RESPONSE, posErrorResponse, posIdempotencyKey } from '@/lib/pos/http'
import { posSupplierSchema } from '@/lib/pos/inputContracts'
import { loadPosSupplierLedger, runPosMutation } from '@/lib/pos/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access.response
  const params = new URL(request.url).searchParams
  const keys = [...params.keys()]
  const parsed = z
    .object({ supplierId: z.string().uuid().optional() })
    .strict()
    .safeParse(Object.fromEntries(params))
  if (keys.length !== new Set(keys).size || !parsed.success) {
    return apiError('Invalid supplier.', 400, {}, POS_PRIVATE_RESPONSE)
  }
  const supplierId = parsed.data.supplierId
  try {
    return apiOk(await loadPosSupplierLedger(access, supplierId), POS_PRIVATE_RESPONSE)
  } catch (loadError) {
    return posErrorResponse(loadError)
  }
}

export async function POST(request: Request) {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access.response
  if (!isPosManager(access))
    return apiError('Manager access required.', 403, {}, POS_PRIVATE_RESPONSE)
  const rateLimit = await enforceRateLimit(request, {
    scope: 'pos.supplier-configure',
    limit: 20,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const idempotencyKey = posIdempotencyKey(request)
  if (!idempotencyKey)
    return apiError('A valid Idempotency-Key header is required.', 400, {}, POS_PRIVATE_RESPONSE)
  const { data, error } = await parseBodyWithSchema(request, posSupplierSchema, {
    maxBytes: 32 * 1024,
  })
  if (!data || error) return apiError(error || 'Invalid supplier.', 400, {}, POS_PRIVATE_RESPONSE)

  let freshFactorMethod: 'totp' | 'backup' | undefined
  if (data.openingBalance > 0) {
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
    return apiOk(
      await runPosMutation('pos_configure_supplier_v1', access.employee.id, idempotencyKey, {
        ...payload,
        ...(freshFactorMethod ? { freshFactorMethod } : {}),
      }),
      { status: 201, ...POS_PRIVATE_RESPONSE },
    )
  } catch (mutationError) {
    return posErrorResponse(mutationError)
  }
}
