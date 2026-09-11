import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { parseBodyWithSchema } from '@/lib/api/request'
import { ADMIN_ROLES, requireStaffSession } from '@/lib/auth/staffSession'
import { loyaltyWalkInConsumeSchema } from '@/lib/loyalty/contracts'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

export async function POST(request: Request) {
  const access = await requireStaffSession({ roles: [...ADMIN_ROLES] })
  if (!access.authorized) return access.response
  const limited = await enforceRateLimit(request, { scope: 'loyalty.walk-in', limit: 30, windowSeconds: 900, identities: [`user:${access.employee.id}`, `ip:${getClientIp(request)}`] })
  if (!limited.allowed) return limited.response
  const parsed = await parseBodyWithSchema(request, loyaltyWalkInConsumeSchema, { maxBytes: 4096 })
  if (!parsed.data || parsed.error) return apiError(parsed.error || 'Invalid walk-in request.', 400, {}, PRIVATE)
  const service = getServiceSupabaseClient()
  const { data: member, error: lookupError } = await service.from('mobile_users').select('id').eq('customer_code', parsed.data.customerCode.toUpperCase()).eq('customer_lifecycle_status', 'active').maybeSingle()
  if (lookupError) return apiError('Walk-in access is unavailable.', 503, {}, PRIVATE)
  if (!member) return apiError('No active loyalty customer matched that code.', 404, {}, PRIVATE)
  const { data, error } = await service.rpc('customer_loyalty_consume_walkin_v1', {
    p_mobile_user_id: member.id, p_location_id: parsed.data.locationId,
    p_service_type: parsed.data.serviceType, p_actor_employee_id: access.employee.id,
    p_idempotency_key: parsed.data.idempotencyKey, p_is_override: parsed.data.isOverride,
    p_override_reason: parsed.data.overrideReason, p_consume_allowance: parsed.data.consumeAllowance,
  })
  if (error) return apiError(error.hint || error.message, 409, {}, PRIVATE)
  return apiOk(data, PRIVATE)
}
