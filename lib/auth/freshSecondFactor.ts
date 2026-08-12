import bcrypt from 'bcryptjs'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

export type SecondFactorMethod = 'totp' | 'backup'

type BackupCodeRow = {
  id: string
  code_hash: string | null
  used: boolean | null
}

type VerificationResult =
  | { verified: true; method: SecondFactorMethod }
  | { verified: false; error: string }

export type BackupCodeConsumptionResult =
  | { consumed: true; codeId: string }
  | { consumed: false; error: string; unavailable?: boolean }

async function verifyTotp(code: string): Promise<VerificationResult> {
  const supabase = await getRouteSupabaseClient()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) return { verified: false, error: 'Unable to load 2FA factors' }

  const factors = data as {
    all?: Array<{ id: string; factor_type?: string; status?: string }>
    totp?: Array<{ id: string; status?: string }>
  }
  const factor =
    factors.totp?.find((item) => item.status === 'verified') ||
    factors.all?.find((item) => item.factor_type === 'totp' && item.status === 'verified')

  if (!factor?.id) {
    return { verified: false, error: 'No verified authenticator factor found' }
  }

  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor.id,
    code,
  })
  return verifyError
    ? { verified: false, error: 'Invalid authenticator code' }
    : { verified: true, method: 'totp' }
}

export async function consumeBackupCodeAtomically(
  userId: string,
  rawCode: unknown,
): Promise<BackupCodeConsumptionResult> {
  const code = String(rawCode || '').trim()
  if (!code) return { consumed: false, error: 'Verification code required' }

  const supabase = getServiceSupabaseClient()
  const { data, error } = await supabase
    .from('backup_codes')
    .select('id, code_hash, used')
    .eq('employee_id', userId)

  if (error) {
    return { consumed: false, error: 'Unable to verify backup code', unavailable: true }
  }

  for (const row of (data || []) as BackupCodeRow[]) {
    if (row.used || !row.code_hash || !(await bcrypt.compare(code, row.code_hash))) continue

    // The used=false predicate makes simultaneous consumption fail closed.
    const { data: consumed, error: updateError } = await supabase
      .from('backup_codes')
      .update({ used: true })
      .eq('id', row.id)
      .eq('used', false)
      .select('id')
      .maybeSingle()

    if (!updateError && consumed?.id) return { consumed: true, codeId: consumed.id }
  }

  return { consumed: false, error: 'Invalid or used backup code' }
}

async function verifyBackupCode(userId: string, code: string): Promise<VerificationResult> {
  const result = await consumeBackupCodeAtomically(userId, code)
  return result.consumed
    ? { verified: true, method: 'backup' }
    : { verified: false, error: result.error }
}

/** Verify a TOTP or one-time backup code immediately before a destructive action. */
export async function verifyFreshSecondFactor(input: {
  userId: string
  code: unknown
  method?: unknown
}): Promise<VerificationResult> {
  const code = String(input.code || '').trim()
  if (!code) return { verified: false, error: 'Verification code required' }

  if (input.method === 'totp') return verifyTotp(code)
  if (input.method === 'backup') return verifyBackupCode(input.userId, code)
  if (input.method !== undefined && input.method !== '' && input.method !== 'auto') {
    return { verified: false, error: 'Invalid verification method' }
  }

  const totp = await verifyTotp(code)
  if (totp.verified) return totp
  return verifyBackupCode(input.userId, code)
}
