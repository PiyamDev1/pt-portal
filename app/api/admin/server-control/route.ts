/**
 * GET/POST /api/admin/server-control
 *
 * Super Admin only. GET reads Hetzner server status. POST runs a whitelisted
 * server power action after a fresh TOTP or backup-code verification.
 */

import bcrypt from 'bcryptjs'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { requireSuperAdminSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'
import {
  getServerControlConfig,
  getServerControlStatus,
  runServerControlAction,
  type ServerControlAction,
} from '@/lib/serverControl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type VerificationMethod = 'totp' | 'backup'

type ServerActionBody = {
  action?: unknown
  verificationCode?: unknown
  verificationMethod?: unknown
}

type BackupCodeRow = {
  id: string
  code_hash: string | null
  used: boolean | null
}

const SERVER_ACTIONS = new Set(['start', 'stop', 'restart'])
const VERIFICATION_METHODS = new Set(['totp', 'backup'])

function isServerControlAction(value: unknown): value is ServerControlAction {
  return typeof value === 'string' && SERVER_ACTIONS.has(value)
}

function isVerificationMethod(value: unknown): value is VerificationMethod {
  return typeof value === 'string' && VERIFICATION_METHODS.has(value)
}

async function verifyTotpCode(code: string) {
  const supabase = await getRouteSupabaseClient()
  const { data, error } = await supabase.auth.mfa.listFactors()

  if (error) {
    return { verified: false, error: 'Unable to load 2FA factors' }
  }

  const factors = data as {
    all?: Array<{ id: string; factor_type?: string; status?: string }>
    totp?: Array<{ id: string; status?: string }>
  }
  const factor =
    factors.totp?.find((item) => item.status === 'verified') ||
    factors.all?.find((item) => item.factor_type === 'totp' && item.status === 'verified') ||
    factors.totp?.[0] ||
    factors.all?.find((item) => item.factor_type === 'totp')

  if (!factor?.id) {
    return { verified: false, error: 'No verified authenticator factor found' }
  }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  })

  if (verifyError) {
    return { verified: false, error: 'Invalid authenticator code' }
  }

  return { verified: true }
}

async function consumeBackupCode(userId: string, code: string) {
  const supabase = getSupabaseClient()
  const { data, error } = await supabase
    .from('backup_codes')
    .select('id, code_hash, used')
    .eq('employee_id', userId)

  if (error) {
    return { verified: false, error: 'Unable to verify backup code' }
  }

  let matchingUnusedCodeId: string | null = null
  for (const row of (data || []) as BackupCodeRow[]) {
    const matches = row.code_hash ? await bcrypt.compare(code, row.code_hash) : false
    if (matches && !row.used && !matchingUnusedCodeId) {
      matchingUnusedCodeId = row.id
    }
  }

  if (!matchingUnusedCodeId) {
    return { verified: false, error: 'Invalid or used backup code' }
  }

  const { error: updateError } = await supabase
    .from('backup_codes')
    .update({ used: true })
    .eq('id', matchingUnusedCodeId)

  if (updateError) {
    return { verified: false, error: 'Unable to consume backup code' }
  }

  return { verified: true }
}

async function verifyPowerActionCode(userId: string, method: VerificationMethod, code: string) {
  if (method === 'totp') {
    return verifyTotpCode(code)
  }

  return consumeBackupCode(userId, code)
}

export async function GET() {
  const access = await requireSuperAdminSession()
  if (!access.authorized) return access.response

  try {
    const status = await getServerControlStatus()
    return apiOk(status)
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load server status'), 502)
  }
}

export async function POST(request: Request) {
  const access = await requireSuperAdminSession()
  if (!access.authorized) return access.response

  const body = (await request.json().catch(() => ({}))) as ServerActionBody
  if (!isServerControlAction(body.action)) {
    return apiError('Invalid server action', 400)
  }

  if (!isVerificationMethod(body.verificationMethod)) {
    return apiError('Invalid verification method', 400)
  }

  const verificationCode = String(body.verificationCode || '').trim()
  if (!verificationCode) {
    return apiError('Verification code required', 400)
  }

  const config = getServerControlConfig()
  if (!config.configured) {
    return apiError('Server control is not configured', 503)
  }

  const verification = await verifyPowerActionCode(
    access.user.id,
    body.verificationMethod,
    verificationCode,
  )

  if (!verification.verified) {
    console.warn('[server-control] Power action verification failed', {
      userId: access.user.id,
      action: body.action,
      method: body.verificationMethod,
    })
    return apiError(verification.error || 'Verification failed', 403)
  }

  try {
    const result = await runServerControlAction(body.action)
    return apiOk(result)
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to run server action'), 502)
  }
}
