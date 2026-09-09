import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { ADMIN_ROLES, requireStaffSession } from '@/lib/auth/staffSession'
import { loyaltyAdjustmentSchema } from '@/lib/loyalty/contracts'
import { adjustLoyaltyPoints, loadLoyaltyMember } from '@/lib/loyalty/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request, context: { params: Promise<{ memberId: string }> }) {
  const access = await requireStaffSession({ roles: [...ADMIN_ROLES] })
  if (!access.authorized) return access.response
  const { memberId } = await context.params
  if (!UUID.test(memberId)) return apiError('Invalid loyalty member.', 400, {}, PRIVATE_RESPONSE)
  const rateLimit = await enforceRateLimit(request, {
    scope: 'loyalty.staff-adjustment',
    limit: 20,
    windowSeconds: 15 * 60,
    identities: [`user:${access.employee.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const { data, error } = await parseBodyWithSchema(request, loyaltyAdjustmentSchema, {
    maxBytes: 4096,
  })
  if (!data || error) return apiError(error || 'Invalid points adjustment.', 400, {}, PRIVATE_RESPONSE)
  try {
    await adjustLoyaltyPoints({
      actorEmployeeId: access.employee.id,
      memberId,
      ...data,
    })
    const payload = await loadLoyaltyMember(memberId)
    return payload
      ? apiOk(payload, { status: 201, ...PRIVATE_RESPONSE })
      : apiError('Loyalty member not found.', 404, {}, PRIVATE_RESPONSE)
  } catch (adjustmentError) {
    return apiError(
      adjustmentError instanceof Error ? adjustmentError.message : 'Unable to save adjustment.',
      409,
      {},
      PRIVATE_RESPONSE,
    )
  }
}
