/**
 * POST /api/admin/disable-enable-employee
 * Toggles employee active state based on manager/admin authorization scope.
 *
 * @module app/api/admin/disable-enable-employee
 */

import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

/**
 * API endpoint to disable/enable employees
 * Accessible by: Managers (for their reports) and Super Admin (for anyone)
 *
 * Body:
 * - employeeId: string - ID of employee to disable/enable
 * - isActive: boolean - desired status
 */
export async function POST(request) {
  try {
    // Initialize clients
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {},
        },
      },
    )

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    // 1. Verify caller is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return apiError('Unauthorized', 401)
    }

    // 2. Get request body
    const body = await request.json()
    const { employeeId, isActive } = body

    if (!employeeId || typeof isActive !== 'boolean') {
      return apiError('Missing or invalid parameters: employeeId and isActive required', 400)
    }

    // 3. Get current user's role and manager info
    const { data: currentUser, error: userError } = await supabaseAdmin
      .from('employees')
      .select('id, manager_id, roles(name)')
      .eq('id', user.id)
      .single()

    if (userError || !currentUser) {
      return apiError('User profile not found', 404)
    }

    const role = Array.isArray(currentUser.roles)
      ? currentUser.roles[0]?.name
      : currentUser.roles?.name

    const isSuperAdmin = role === 'Master Admin'

    // 4. Authorization check
    // Only Super Admin or a manager of the employee can disable/enable
    if (!isSuperAdmin) {
      // Check if caller is a manager of this employee
      const isManager = await checkIfManager(supabaseAdmin, user.id, employeeId)
      if (!isManager) {
        console.warn(
          `[disable-enable-employee] Unauthorized: ${user.email} tried to modify ${employeeId}`,
        )
        return apiError('Unauthorized: Only managers or super admin can disable/enable employees', 403)
      }
    }

    // 5. Don't allow disabling yourself
    if (user.id === employeeId && !isActive) {
      return apiError('Cannot disable your own account', 400)
    }

    // 6. Update employee status
    const { error: updateError } = await supabaseAdmin
      .from('employees')
      .update({ is_active: isActive })
      .eq('id', employeeId)

    if (updateError) throw updateError

    const status = isActive ? 'enabled' : 'disabled'
    console.warn(`[disable-enable-employee] ${user.email} ${status} employee ${employeeId}`)

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
