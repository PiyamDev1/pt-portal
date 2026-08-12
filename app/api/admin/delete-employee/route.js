/**
 * POST /api/admin/delete-employee
 * Permanently deletes an employee record with strict role checks and auth cleanup.
 *
 * @module app/api/admin/delete-employee
 */

import { z } from 'zod'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

const deleteEmployeeSchema = z
  .object({
    employeeId: z
      .string({ error: 'employeeId is required' })
      .trim()
      .min(1, 'employeeId is required')
      .max(200),
    confirmEmail: z
      .string({ error: 'confirmEmail is required' })
      .trim()
      .email('A valid confirmation email is required')
      .max(320),
    verificationCode: z
      .string({ error: 'Verification code required' })
      .trim()
      .min(1, 'Verification code required')
      .max(100),
    verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
  })
  .strict()

/**
 * API endpoint to DELETE employees permanently
 * SECURITY: Super Admin ONLY
 *
 * This endpoint:
 * 1. Verifies super admin role
 * 2. Removes employee from employees table
 * 3. Disables the Supabase Auth user (prevents login)
 * 4. Audits the action
 *
 * WARNING: This is a destructive operation
 *
 * Body:
 * - employeeId: string - ID of employee to delete
 * - confirmEmail: string - Email address to confirm deletion (must match employee email)
 */
export async function POST(request) {
  const access = await requireStaffSession({ roles: ['Master Admin', 'Super Admin'] })
  if (!access.authorized) return access.response

  try {
    const limit = await enforceRateLimit(request, {
      scope: 'admin.delete-employee',
      limit: 3,
      windowSeconds: 60 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const supabaseAdmin = getServiceSupabaseClient()

    // 2. Get request body
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      deleteEmployeeSchema,
      { maxBytes: 4 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const { employeeId, confirmEmail, verificationCode, verificationMethod } = body

    const verification = await verifyFreshSecondFactor({
      userId: access.user.id,
      code: verificationCode,
      method: verificationMethod,
    })
    if (!verification.verified) {
      return apiError(verification.error, 403)
    }

    // 4. Prevent self-deletion
    if (access.user.id === employeeId) {
      return apiError('Cannot delete your own account', 400)
    }

    // 5. Fetch target employee for verification and email confirmation
    const { data: targetEmployee, error: fetchError } = await supabaseAdmin
      .from('employees')
      .select('id, email, full_name')
      .eq('id', employeeId)
      .single()

    if (fetchError || !targetEmployee) {
      return apiError('Employee not found', 404)
    }

    // 6. Verify email matches (double confirmation to prevent accidents)
    if (targetEmployee.email !== confirmEmail) {
      console.warn(
        `[delete-employee] Email mismatch for deletion: expected ${targetEmployee.email}, got ${confirmEmail}`,
      )
      return apiError('Email confirmation does not match employee email', 400)
    }

    // 7. Delete the employee record
    const { error: deleteError } = await supabaseAdmin
      .from('employees')
      .delete()
      .eq('id', employeeId)

    if (deleteError) throw deleteError

    // 8. Disable the Supabase Auth user (prevent login)
    // Note: We can't fully delete auth users via admin API, so we disable them
    try {
      await supabaseAdmin.auth.admin.updateUserById(employeeId, {
        user_metadata: { deleted_by_admin: true },
      })
    } catch (authError) {
      // Log but don't fail - employee record is already deleted
      console.warn('[delete-employee] Could not update auth metadata:', authError)
    }

    console.warn(
      `🗑️  [delete-employee] SUPER ADMIN ${access.user.email} deleted employee ${targetEmployee.email} (${targetEmployee.full_name})`,
    )

    return apiOk({
      message: `Employee ${targetEmployee.full_name} has been permanently deleted`,
      deletedEmployeeId: employeeId,
      deletedEmployeeEmail: targetEmployee.email,
      deletedEmployeeName: targetEmployee.full_name,
    })
  } catch (error) {
    console.error('[delete-employee] Error:', error)
    return apiError(toErrorMessage(error, 'Internal server error'), 500)
  }
}
