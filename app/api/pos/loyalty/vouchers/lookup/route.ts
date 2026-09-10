import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { POS_PRIVATE_RESPONSE, posErrorResponse } from '@/lib/pos/http'
import { lookupPosLoyaltyVoucher } from '@/lib/pos/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const lookupSchema = z.object({ code: z.string().trim().min(1).max(128) }).strict()

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'pos.voucher-lookup',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const { data, error } = await parseBodyWithSchema(request, lookupSchema, { maxBytes: 1024 })
  if (!data || error)
    return apiError(error || 'Invalid voucher code.', 400, {}, POS_PRIVATE_RESPONSE)
  try {
    return apiOk(await lookupPosLoyaltyVoucher(data.code), POS_PRIVATE_RESPONSE)
  } catch (lookupError) {
    return posErrorResponse(lookupError)
  }
}
