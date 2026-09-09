import { apiError, apiOk } from '@/lib/api/http'
import { ADMIN_ROLES, requireStaffSession } from '@/lib/auth/staffSession'
import { loadLoyaltyMember } from '@/lib/loyalty/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(_request: Request, context: { params: Promise<{ memberId: string }> }) {
  const access = await requireStaffSession({ roles: [...ADMIN_ROLES] })
  if (!access.authorized) return access.response
  const { memberId } = await context.params
  if (!UUID.test(memberId)) return apiError('Invalid loyalty member.', 400, {}, PRIVATE_RESPONSE)
  try {
    const payload = await loadLoyaltyMember(memberId)
    return payload
      ? apiOk(payload, PRIVATE_RESPONSE)
      : apiError('Loyalty member not found.', 404, {}, PRIVATE_RESPONSE)
  } catch {
    return apiError('Loyalty member is temporarily unavailable.', 503, {}, PRIVATE_RESPONSE)
  }
}
