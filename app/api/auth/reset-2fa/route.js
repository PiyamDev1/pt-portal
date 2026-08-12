/**
 * API Route: Reset Two-Factor Authentication
 *
 * POST /api/auth/reset-2fa
 *
 * Removes all MFA factors for a user via the Supabase Admin API and resets
 * the two_factor_enabled flag in the employees table. The user will be
 * forced to set up 2FA again on their next login.
 *
 * Request Body: {}
 * Response Success (200): { resetUserId, removedFactors: number }
 * Response Errors: 401 Unauthorized | 500 MFA API or DB error
 *
 * Authentication: Current session cookie
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { recordAuthSecurityEvent } from '@/lib/auth/securityEvents'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const resetTwoFactorSchema = z.object({
  verificationCode: z.string().trim().min(1, 'Verification code required').max(100),
  verificationMethod: z.enum(['totp', 'backup', 'auto']).default('auto'),
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
      resetTwoFactorSchema,
      { maxBytes: 4 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const limit = await enforceRateLimit(request, {
      scope: 'auth.reset-2fa',
      limit: 5,
      windowSeconds: 15 * 60,
      identities: [`user:${user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const verification = await verifyFreshSecondFactor({
      userId: user.id,
      code: body.verificationCode,
      method: body.verificationMethod,
    })
    if (!verification.verified) {
      await recordAuthSecurityEvent({
        request,
        userId: user.id,
        email: user.email,
        eventType: 'two_factor',
        status: 'failed',
        metadata: { action: 'reset_2fa' },
      })
      return apiError(verification.error || 'Verification failed', 403)
    }

    // Initialize client inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    // 1. List existing factors
    const { data: factors, error: listError } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId: user.id,
    })

    if (listError) throw listError

    // 2. Delete them all
    const deletePromises = (factors?.factors || []).map((f) =>
      supabaseAdmin.auth.admin.mfa.deleteFactor({
        id: f.id,
        userId: user.id,
      }),
    )

    const deleteResults = await Promise.all(deletePromises)
    const deleteError = deleteResults.find((result) => result.error)?.error
    if (deleteError) throw deleteError

    // 3. Reset the DB flag so they are forced to setup again on next login
    const { error: updateError } = await supabaseAdmin
      .from('employees')
      .update({ two_factor_enabled: false })
      .eq('id', user.id)
    if (updateError) throw updateError

    await recordAuthSecurityEvent({
      request,
      userId: user.id,
      email: user.email,
      eventType: 'two_factor',
      status: 'success',
      metadata: { action: 'reset_2fa', verificationMethod: verification.method },
    })

    return apiOk({ resetUserId: user.id, removedFactors: deletePromises.length })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to reset 2FA'), 500)
  }
}
