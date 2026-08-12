/**
 * POST /api/admin/disable-enable-employee
 * Toggles employee active state based on manager/admin authorization scope.
 *
 * @module app/api/admin/disable-enable-employee
 */

import { z } from 'zod'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { parseBodyWithSchema } from '@/lib/api/request'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

const statusChangeSchema = z
  .object({
    employeeId: z.string().trim().min(1, 'employeeId is required').max(200),
    isActive: z.boolean(),
    verificationCode: z.string().trim().max(100).optional(),
    verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
  })
  .strict()

/**
 * API endpoint to disable/enable employees
 * Accessible by: Managers (for their reports) and Super Admin (for anyone)
 *
 * Body:
 * - employeeId: string - ID of employee to disable/enable
 * - isActive: boolean - desired status
 */
export async function POST(request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const limit = await enforceRateLimit(request, {
      scope: 'admin.employee-status',
      limit: 20,
      windowSeconds: 60 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const supabaseAdmin = getServiceSupabaseClient()

    // 2. Get request body
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      statusChangeSchema,
      { maxBytes: 4 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const { employeeId, isActive, verificationCode, verificationMethod } = body

    if (!isActive) {
      const verification = await verifyFreshSecondFactor({
        userId: access.user.id,
        code: verificationCode,
        method: verificationMethod,
      })
      if (!verification.verified) {
        return apiError(verification.error, 403)
      }
    }

    const isSuperAdmin = ['Master Admin', 'Super Admin'].includes(access.employee.role)

    // 4. Authorization check
    // Only Super Admin or a manager of the employee can disable/enable
    if (!isSuperAdmin) {
      // Check if caller is a manager of this employee
      const isManager = await checkIfManager(supabaseAdmin, access.user.id, employeeId)
      if (!isManager) {
        console.warn(
          `[disable-enable-employee] Unauthorized: ${access.user.email} tried to modify ${employeeId}`,
        )
        return apiError(
          'Unauthorized: Only managers or super admin can disable/enable employees',
          403,
        )
      }
    }

    // 5. Don't allow disabling yourself
    if (access.user.id === employeeId && !isActive) {
      return apiError('Cannot disable your own account', 400)
    }

    // 6. Update employee status
    const { error: updateError } = await supabaseAdmin
      .from('employees')
      .update({ is_active: isActive })
      .eq('id', employeeId)

    if (updateError) throw updateError

    const status = isActive ? 'enabled' : 'disabled'
    console.warn(`[disable-enable-employee] ${access.user.email} ${status} employee ${employeeId}`)

    return apiOk({
      updatedEmployeeId: employeeId,
      message: `Employee ${status} successfully`,
      isActive,
    })
  } catch (error) {
    console.error('[disable-enable-employee] Error:', error)
    return apiError(toErrorMessage(error, 'Internal server error'), 500)
  }
}

/**
 * Helper: Check if userId is a manager of targetEmployeeId
 * Includes hierarchical checks (manager of manager counts as manager)
 */
async function checkIfManager(supabase, managerId, targetEmployeeId) {
  const { data: targetEmployee, error } = await supabase
    .from('employees')
    .select('manager_id')
    .eq('id', targetEmployeeId)
    .single()

  if (error || !targetEmployee) return false

  // Direct manager
  if (targetEmployee.manager_id === managerId) return true

  // Check up the chain for this manager
  let current = targetEmployee.manager_id
  const visited = new Set()

  while (current && !visited.has(current)) {
    visited.add(current)
    if (current === managerId) return true

    const { data: emp } = await supabase
      .from('employees')
      .select('manager_id')
      .eq('id', current)
      .single()

    current = emp?.manager_id || null
  }

  return false
}
