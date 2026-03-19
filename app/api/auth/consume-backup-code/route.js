/**
 * API Route: Consume Backup Code
 *
 * POST /api/auth/consume-backup-code
 *
 * Validates a backup code by comparing it against all stored bcrypt hashes
 * for the user and marks the matching code as used. Falls through all rows
 * before responding, so timing is not significantly shorter on failure.
 *
 * Request Body: { userId: string, code: string }
 * Response Success (200): { consumedCodeId: string }
 * Response Errors:
 *   400 - Missing fields or code is invalid/already used
 *   500 - DB error
 *
 * Authentication: Service role key (called during 2FA recovery flow)
 */
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
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

    const { userId, code } = await request.json()
    if (!userId || !code)
      return apiError('userId and code required', 400)

    const { data: rows, error } = await supabaseAdmin
      .from('backup_codes')
      .select('*')
      .eq('employee_id', userId)

    if (error) {
      return apiError(error.message, 500)
    }

    for (const r of rows || []) {
      const match = await bcrypt.compare(code, r.code_hash)
      if (match && !r.used) {
        // mark used
        await supabaseAdmin.from('backup_codes').update({ used: true }).eq('id', r.id)
        return apiOk({ consumedCodeId: r.id }, { status: 200 })
      }
    }

    return apiError('Invalid or used backup code', 400)
  } catch (e) {
    return apiError(toErrorMessage(e, 'Failed to consume backup code'), 500)
  }
}
