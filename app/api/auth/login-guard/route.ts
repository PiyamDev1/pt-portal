import { apiError, apiOk } from '@/lib/api/http'
import { getLoginGuard, recordAuthSecurityEvent } from '@/lib/auth/securityEvents'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const loginGuardSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Valid email required')
    .max(320)
    .transform((value) => value.toLowerCase()),
})

export async function POST(request: Request) {
  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(request, loginGuardSchema, {
      maxBytes: 2 * 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Email required', 400)
    const email = body.email

    const limit = await enforceRateLimit(request, {
      scope: 'auth.login-guard',
      limit: 10,
      windowSeconds: 15 * 60,
      identities: [`ip:${getClientIp(request)}`, `email:${email}`],
    })
    if (!limit.allowed) return limit.response

    const guard = await getLoginGuard(email)
    if (guard.locked) {
      await recordAuthSecurityEvent({
        request,
        email,
        eventType: 'password_login',
        status: 'blocked',
        metadata: { failedAttempts: guard.failedAttempts },
      })
    }

    return apiOk(guard)
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Unable to check login guard', 500)
  }
}
