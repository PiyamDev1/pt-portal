/**
 * API Route: Generate Backup Codes
 *
 * POST /api/auth/generate-backup-codes
 *
 * Generates a fresh set of one-time backup codes for a user (default 10).
 * Each code is 8-char format: XXXX-XXXX using uppercase alphanumeric chars.
 * All previous unused codes are deleted before inserting the new set.
 * Plaintext codes are returned once — the caller must present them to the
 * user immediately; only bcrypt hashes are stored in the database.
 *
 * Request Body: { userId: string, count?: number }
 * Response Success (200): { codes: string[], generatedCount: number }
 * Response Errors: 400 Missing userId | 500 DB insert failed
 *
 * Authentication: Service role key (internal admin call)
 */
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeCode() {
  // 8 char groups like: AB12-CD34
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'
  const pick = (n) =>
    Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `${pick(4)}-${pick(4)}`
}

export async function POST(request) {
  try {
    // Initialize client inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { userId, count = 10 } = await request.json()
    if (!userId) return apiError('userId required', 400)

    const codesPlain = []
    const rows = []
    for (let i = 0; i < count; i++) {
      const code = makeCode()
      const hash = await bcrypt.hash(code, 12)
      codesPlain.push(code)
      rows.push({ employee_id: userId, code_hash: hash, used: false })
    }

    // remove existing unused codes for user and insert new set
    await supabaseAdmin.from('backup_codes').delete().eq('employee_id', userId)
    const { error } = await supabaseAdmin.from('backup_codes').insert(rows)
    if (error) {
      return apiError(error.message, 500)
    }

    // Return plaintext codes once (should be presented to user and not stored client-side permanently)
    return apiOk({ codes: codesPlain, generatedCount: codesPlain.length }, { status: 200 })
  } catch (e) {
    return apiError(toErrorMessage(e, 'Failed to generate backup codes'), 500)
  }
}
