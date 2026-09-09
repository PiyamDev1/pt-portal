import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { ADMIN_ROLES, requireStaffSession } from '@/lib/auth/staffSession'
import { loyaltyProgramMutationSchema } from '@/lib/loyalty/contracts'
import { loadLoyaltyDashboard, manageLoyaltyProgram } from '@/lib/loyalty/server'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } }

export async function PATCH(request: Request) {
  const access = await requireStaffSession({ roles: [...ADMIN_ROLES] })
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'loyalty.program-management',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.employee.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response
  const { data, error } = await parseBodyWithSchema(request, loyaltyProgramMutationSchema, {
    maxBytes: 16_384,
  })
  if (!data || error) return apiError(error || 'Invalid program change.', 400, {}, PRIVATE_RESPONSE)
  try {
    const { action, ...body } = data
    await manageLoyaltyProgram({ actorEmployeeId: access.employee.id, action, request: body })
    return apiOk(await loadLoyaltyDashboard('', true), PRIVATE_RESPONSE)
  } catch (saveError) {
    return apiError(
      saveError instanceof Error ? saveError.message : 'Unable to save program change.',
      409,
      {},
      PRIVATE_RESPONSE,
    )
  }
}
