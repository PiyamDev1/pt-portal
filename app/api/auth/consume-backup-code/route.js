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

    const { code } = await request.json().catch(() => ({}))
    if (!code) return apiError('code required', 400)

    const { data: rows, error } = await supabaseAdmin
      .from('backup_codes')
      .select('*')
      .eq('employee_id', user.id)

    if (error) {
      return apiError(error.message, 500)
    }

    for (const r of rows || []) {
      const match = await bcrypt.compare(code, r.code_hash)
      if (match && !r.used) {
        // mark used
        await supabaseAdmin.from('backup_codes').update({ used: true }).eq('id', r.id)
        await recordAuthSecurityEvent({
          request,
          userId: user.id,
          email: user.email,
          eventType: 'backup_code',
          status: 'success',
        })
        return apiOk({ consumedCodeId: r.id }, { status: 200 })
      }
    }

    await recordAuthSecurityEvent({
      request,
      userId: user.id,
      email: user.email,
      eventType: 'backup_code',
      status: 'failed',
    })
    return apiError('Invalid or used backup code', 400)
  } catch (e) {
    return apiError(toErrorMessage(e, 'Failed to consume backup code'), 500)
  }
}
