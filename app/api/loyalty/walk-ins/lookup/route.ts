import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { loyaltyMemberServiceLookupSchema } from '@/lib/loyalty/contracts'
import { lookupMemberService, MemberServiceError } from '@/lib/loyalty/memberService'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PRIVATE = { headers: { 'Cache-Control': 'private, no-store' } }

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response
  const limited = await enforceRateLimit(request, {
    scope: 'loyalty.member-service.lookup',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.employee.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limited.allowed) return limited.response
  const parsed = await parseBodyWithSchema(request, loyaltyMemberServiceLookupSchema, {
    maxBytes: 2048,
  })
  if (!parsed.data || parsed.error) {
    return apiError(parsed.error || 'Invalid Member Service request.', 400, {}, PRIVATE)
  }
  try {
    return apiOk(
      await lookupMemberService({
        rawCode: parsed.data.customerCode,
        locationId: parsed.data.locationId,
      }),
      PRIVATE,
    )
  } catch (error) {
    if (error instanceof MemberServiceError) {
      return apiError(error.message, error.status, { code: error.code }, PRIVATE)
    }
    return apiError('Member Service is temporarily unavailable.', 503, {}, PRIVATE)
  }
}
