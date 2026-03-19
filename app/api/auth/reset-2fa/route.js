/**
 * API Route: Reset Two-Factor Authentication
 *
 * POST /api/auth/reset-2fa
 *
 * Removes all MFA factors for a user via the Supabase Admin API and resets
 * the two_factor_enabled flag in the employees table. The user will be
 * forced to set up 2FA again on their next login.
 *
 * Request Body: { userId: string }
 * Response Success (200): { resetUserId, removedFactors: number }
 * Response Errors: 400 Missing userId | 500 MFA API or DB error
 *
 * Authentication: Service role key (called by admin panel)
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  try {
    // Initialize client inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { userId } = await request.json()

    if (!userId) {
      return apiError('User ID required', 400)
    }

    // 1. List existing factors
    const { data: factors, error: listError } = await supabaseAdmin.auth.admin.mfa.listFactors({
      userId,
    })

    if (listError) throw listError

    // 2. Delete them all
    const deletePromises = (factors?.factors || []).map((f) =>
      supabaseAdmin.auth.admin.mfa.deleteFactor({
        id: f.id,
        userId,
      }),
    )

    await Promise.all(deletePromises)

    // 3. Reset the DB flag so they are forced to setup again on next login
    await supabaseAdmin.from('employees').update({ two_factor_enabled: false }).eq('id', userId)

    return apiOk({ resetUserId: userId, removedFactors: deletePromises.length })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to reset 2FA'), 500)
  }
}
