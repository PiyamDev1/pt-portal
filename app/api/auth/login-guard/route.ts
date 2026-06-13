import { apiError, apiOk } from '@/lib/api/http'
import { getLoginGuard, recordAuthSecurityEvent } from '@/lib/auth/securityEvents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { email?: string }
    const email = body.email?.trim().toLowerCase()

    if (!email) return apiError('Email required', 400)

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
