import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireSuperAdminSession } from '@/lib/adminSessionAuth'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { recordAuthSecurityEvent, recordAuthSecurityEventStrict } from '@/lib/auth/securityEvents'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const recoverySchema = z.object({
  employeeId: z.string().uuid('Invalid employee ID'),
  confirmEmail: z.string().trim().email('Valid employee email required'),
  reason: z.string().trim().min(10, 'Recovery reason must be at least 10 characters').max(1_000),
  verificationCode: z.string().trim().min(1, 'Verification code required').max(100),
  verificationMethod: z.enum(['totp', 'backup', 'auto']).default('auto'),
})

/**
 * Audited break-glass recovery for a staff member who cannot use any factor.
 * Self-service reset remains separate and requires the user's current factor.
 */
export async function POST(request: Request) {
  const access = await requireSuperAdminSession()
  if (!access.authorized) return access.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, recoverySchema, {
    maxBytes: 8 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid recovery request', 400)

  if (body.employeeId === access.user.id) {
    return apiError('Use the self-service 2FA reset for your own account', 400)
  }

  const rateLimit = await enforceRateLimit(request, {
    scope: 'admin.recover-employee-2fa',
    limit: 5,
    windowSeconds: 60 * 60,
    identities: [
      `actor:${access.user.id}`,
      `target:${body.employeeId}`,
      `ip:${getClientIp(request)}`,
    ],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const verification = await verifyFreshSecondFactor({
    userId: access.user.id,
    code: body.verificationCode,
    method: body.verificationMethod,
  })
  if (!verification.verified) {
    await recordAuthSecurityEvent({
      request,
      userId: access.user.id,
      email: access.user.email,
      eventType: 'two_factor',
      status: 'failed',
      metadata: { action: 'admin_recovery', targetUserId: body.employeeId },
    })
    return apiError(verification.error, 403)
  }

  try {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: employee, error: employeeError } = await admin
      .from('employees')
      .select('id, email, full_name')
      .eq('id', body.employeeId)
      .maybeSingle()

    if (employeeError) throw employeeError
    if (!employee) return apiError('Employee not found', 404)
    if (
      String(employee.email || '')
        .trim()
        .toLowerCase() !== body.confirmEmail.toLowerCase()
    ) {
      return apiError('Employee email confirmation does not match', 400)
    }

    await recordAuthSecurityEventStrict({
      request,
      userId: body.employeeId,
      email: employee.email,
      eventType: 'two_factor',
      status: 'started',
      metadata: {
        action: 'admin_recovery',
        actorUserId: access.user.id,
        actorEmail: access.user.email,
        reason: body.reason,
        verificationMethod: verification.method,
      },
    })

    const { data: factors, error: listError } = await admin.auth.admin.mfa.listFactors({
      userId: body.employeeId,
    })
    if (listError) throw listError

    const deletions = await Promise.all(
      (factors?.factors || []).map((factor) =>
        admin.auth.admin.mfa.deleteFactor({ userId: body.employeeId, id: factor.id }),
      ),
    )
    const factorError = deletions.find((result) => result.error)?.error
    if (factorError) throw factorError

    const { error: backupCodeError } = await admin
      .from('backup_codes')
      .delete()
      .eq('employee_id', body.employeeId)
    if (backupCodeError) throw backupCodeError

    const { error: updateError } = await admin
      .from('employees')
      .update({ two_factor_enabled: false })
      .eq('id', body.employeeId)
    if (updateError) throw updateError

    await recordAuthSecurityEventStrict({
      request,
      userId: body.employeeId,
      email: employee.email,
      eventType: 'two_factor',
      status: 'revoked',
      metadata: {
        action: 'admin_recovery',
        actorUserId: access.user.id,
        actorEmail: access.user.email,
        reason: body.reason,
        removedFactors: deletions.length,
        verificationMethod: verification.method,
      },
    })

    return apiOk({
      recoveredEmployeeId: body.employeeId,
      employeeName: employee.full_name || employee.email,
      removedFactors: deletions.length,
      requiresSetup: true,
    })
  } catch (error) {
    await recordAuthSecurityEvent({
      request,
      userId: access.user.id,
      email: access.user.email,
      eventType: 'two_factor',
      status: 'failed',
      metadata: { action: 'admin_recovery', targetUserId: body.employeeId },
    })
    return apiError(toErrorMessage(error, 'Failed to recover employee 2FA'), 500)
  }
}
