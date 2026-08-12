/**
 * API Route: Consume Backup Code
 *
 * POST /api/auth/consume-backup-code
 *
 * Validates a backup code by comparing it against all stored bcrypt hashes
 * for the user and marks the matching code as used. Falls through all rows
 * before responding, so timing is not significantly shorter on failure.
 *
 * Request Body: { code: string }
 * Response Success (200): { consumedCodeId: string }
 * Response Errors:
 *   400 - Missing fields or code is invalid/already used
 *   401 - Unauthorized
 *   500 - DB error
 *
 * Authentication: Current session cookie from the in-progress login session
 */
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordAuthSecurityEvent } from '@/lib/auth/securityEvents'
import { consumeBackupCodeAtomically } from '@/lib/auth/freshSecondFactor'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const consumeBackupCodeSchema = z.object({
  code: z.string().trim().min(1, 'code required').max(100),
})

export async function POST(request) {
  try {
    const supabase = await getRouteSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return apiError('Unauthorized', 401)

    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      consumeBackupCodeSchema,
      { maxBytes: 2 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const { code } = body

    const limit = await enforceRateLimit(request, {
      scope: 'auth.consume-backup-code',
      limit: 6,
      windowSeconds: 15 * 60,
      identities: [`user:${user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const result = await consumeBackupCodeAtomically(user.id, code)
    if (result.consumed) {
      await recordAuthSecurityEvent({
        request,
        userId: user.id,
        email: user.email,
        eventType: 'backup_code',
        status: 'success',
      })
      return apiOk({ consumedCodeId: result.codeId }, { status: 200 })
    }

    await recordAuthSecurityEvent({
      request,
      userId: user.id,
      email: user.email,
      eventType: 'backup_code',
      status: 'failed',
    })
    return apiError(result.error, result.unavailable ? 503 : 400)
  } catch (e) {
    return apiError(toErrorMessage(e, 'Failed to consume backup code'), 500)
  }
}
