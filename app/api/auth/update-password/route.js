/**
 * API Route: Update Password
 *
 * POST /api/auth/update-password
 *
 * Resets a user's password via the Supabase admin API with server-side
 * strength validation. Also clears the is_temporary_password flag in the
 * employees table and records a bcrypt hash in password_history (keeps last 5).
 *
 * Request Body: { newPassword: string }
 * Response Success (200): { updatedUserId, message }
 * Response Errors:
 *   400 - Missing fields or password fails strength requirements
 *   401 - Unauthorized
 *   500 - Supabase auth update failed or DB flag update failed
 *
 * Authentication: Current session cookie
 */
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordAuthSecurityEvent } from '@/lib/auth/securityEvents'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  try {
    const supabase = await getRouteSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return apiError('Unauthorized', 401)

    // Initialize client inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { newPassword } = await request.json().catch(() => ({}))

    if (!newPassword) {
      return apiError('Missing requirements', 400)
    }

    // Server-side password strength validation
    const password = newPassword
    const passErrors = []
    if (password.length < 8) passErrors.push('at least 8 characters')
    if (!/[a-z]/.test(password)) passErrors.push('a lowercase letter')
    if (!/[A-Z]/.test(password)) passErrors.push('an uppercase letter')
    if (!/[0-9]/.test(password)) passErrors.push('a number')
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+\\/\[\];']/.test(password))
      passErrors.push('a special character')

    if (passErrors.length > 0) {
      return apiError(`Password must contain ${passErrors.join(', ')}`, 400)
    }

    // 1. Update Password in Supabase Auth (The real login system)
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    })

    if (authError) {
      await recordAuthSecurityEvent({
        request,
        userId: user.id,
        email: user.email,
        eventType: 'password_update',
        status: 'failed',
        metadata: { reason: authError.message },
      })
      return apiError(authError.message, 400)
    }

    // 2. Update the Flag in your Employees Table (So they aren't asked again)
    const { error: dbError } = await supabaseAdmin
      .from('employees')
      .update({ is_temporary_password: false })
      .eq('id', user.id)

    if (dbError) {
      await recordAuthSecurityEvent({
        request,
        userId: user.id,
        email: user.email,
        eventType: 'password_update',
        status: 'failed',
        metadata: { reason: 'employee_flag_update_failed' },
      })
      return apiError('Password set, but DB flag failed.', 500)
    }

    // 3. Record password hash in password_history (keep latest 5)
    try {
      const hash = await bcrypt.hash(password, 12)
      await supabaseAdmin
        .from('password_history')
        .insert({ employee_id: user.id, password_hash: hash })

      // Keep only last 5 entries
      const { data: rows } = await supabaseAdmin
        .from('password_history')
        .select('id')
        .eq('employee_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5)

      const keepIds = (rows || []).map((r) => r.id).filter(Boolean)
      if (keepIds.length > 0) {
        await supabaseAdmin
          .from('password_history')
          .delete()
          .eq('employee_id', user.id)
          .not('id', 'in', `(${keepIds.join(',')})`)
      }
    } catch (e) {
      // Best-effort: history persistence should not block successful password reset.
    }

    await recordAuthSecurityEvent({
      request,
      userId: user.id,
      email: user.email,
      eventType: 'password_update',
      status: 'success',
    })

    return apiOk(
      { updatedUserId: user.id, message: 'Password updated successfully' },
      { status: 200 },
    )
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update password'), 500)
  }
}
