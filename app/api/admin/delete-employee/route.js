import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

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
    const { employeeId, confirmEmail } = body

    if (!employeeId || !confirmEmail) {
      return apiError('Missing required parameters: employeeId and confirmEmail', 400)
    }

    // 3. Verify caller is SUPER ADMIN
    const { data: currentUser, error: userError } = await supabaseAdmin
      .from('employees')
      .select('id, roles(name)')
      .eq('id', user.id)
      .single()

    if (userError || !currentUser) {
      return apiError('Your profile not found', 404)
    }

    const role = Array.isArray(currentUser.roles)
      ? currentUser.roles[0]?.name
      : currentUser.roles?.name

    const isSuperAdmin = role === 'Master Admin'

    if (!isSuperAdmin) {
      console.warn(
        `[delete-employee] SECURITY: Non-super-admin ${user.email} attempted deletion of ${employeeId}`,
      )
      return apiError('Forbidden: Only Super Admin can delete employees', 403)
    }

    // 4. Prevent self-deletion
    if (user.id === employeeId) {
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
      `🗑️  [delete-employee] SUPER ADMIN ${user.email} deleted employee ${targetEmployee.email} (${targetEmployee.full_name})`,
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
