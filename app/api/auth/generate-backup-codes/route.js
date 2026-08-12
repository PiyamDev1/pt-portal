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
 * Request Body: { count?: number }
 * Response Success (200): { codes: string[], generatedCount: number }
 * Response Errors: 401 Unauthorized | 500 DB insert failed
 *
 * Authentication: Current session cookie
 */
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { recordAuthSecurityEvent } from '@/lib/auth/securityEvents'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function makeCode() {
  // 8 char groups like: AB12-CD34
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'
  const pick = (n) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join('')
  return `${pick(4)}-${pick(4)}`
}

const generateBackupCodesSchema = z.object({
  count: z.coerce.number().int().min(1).max(10).default(10),
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
      generateBackupCodesSchema,
      { maxBytes: 4 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const limit = await enforceRateLimit(request, {
      scope: 'auth.generate-backup-codes',
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
        eventType: 'backup_code',
        status: 'failed',
        metadata: { action: 'regenerate' },
      })
      return apiError(verification.error || 'Verification failed', 403)
    }

    // Initialize client inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const safeCount = body.count

    const codesPlain = []
    const rows = []
    for (let i = 0; i < safeCount; i++) {
      const code = makeCode()
      const hash = await bcrypt.hash(code, 12)
      codesPlain.push(code)
      rows.push({ employee_id: user.id, code_hash: hash, used: false })
    }

    // Replace the set in one database transaction. A failed insert preserves
    // the previously valid recovery codes.
    const { data: generatedCount, error } = await supabaseAdmin.rpc('replace_backup_codes', {
      p_user_id: user.id,
      p_code_hashes: rows.map((row) => row.code_hash),
    })
    if (error || Number(generatedCount) !== rows.length) {
      return apiError(error?.message || 'Failed to store all backup codes', 500)
    }

    await recordAuthSecurityEvent({
      request,
      userId: user.id,
      email: user.email,
      eventType: 'backup_code',
      status: 'success',
      metadata: {
        action: 'regenerate',
        count: rows.length,
        verificationMethod: verification.method,
      },
    })

    // Return plaintext codes once (should be presented to user and not stored client-side permanently)
    return apiOk({ codes: codesPlain, generatedCount: codesPlain.length }, { status: 200 })
  } catch (e) {
    return apiError(toErrorMessage(e, 'Failed to generate backup codes'), 500)
  }
}
