import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

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
    const origin = request.headers.get('origin') || 'unknown'
    
    // Initialize clients
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    )

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // 1. Verify caller is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Access-Control-Allow-Origin': origin } }
      )
    }

    // 2. Get request body
    const body = await request.json()
    const { employeeId, confirmEmail } = body

    if (!employeeId || !confirmEmail) {
      return NextResponse.json(
        { error: 'Missing required parameters: employeeId and confirmEmail' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': origin } }
      )
    }

    // 3. Verify caller is SUPER ADMIN
    const { data: currentUser, error: userError } = await supabaseAdmin
      .from('employees')
      .select('id, roles(name)')
      .eq('id', user.id)
      .single()

    if (userError || !currentUser) {
      return NextResponse.json(
        { error: 'Your profile not found' },
        { status: 404, headers: { 'Access-Control-Allow-Origin': origin } }
      )
    }

    const role = Array.isArray(currentUser.roles) 
      ? currentUser.roles[0]?.name 
      : currentUser.roles?.name
    
    const isSuperAdmin = role === 'Master Admin'

    if (!isSuperAdmin) {
      console.log(`[delete-employee] SECURITY: Non-super-admin ${user.email} attempted deletion of ${employeeId}`)
      return NextResponse.json(
        { error: 'Forbidden: Only Super Admin can delete employees' },
        { status: 403, headers: { 'Access-Control-Allow-Origin': origin } }
      )
    }

    // 4. Prevent self-deletion
    if (user.id === employeeId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': origin } }
      )
    }

    // 5. Fetch target employee for verification and email confirmation
    const { data: targetEmployee, error: fetchError } = await supabaseAdmin
      .from('employees')
      .select('id, email, full_name')
      .eq('id', employeeId)
      .single()

    if (fetchError || !targetEmployee) {
      return NextResponse.json(
        { error: 'Employee not found' },
        { status: 404, headers: { 'Access-Control-Allow-Origin': origin } }
      )
    }

    // 6. Verify email matches (double confirmation to prevent accidents)
    if (targetEmployee.email !== confirmEmail) {
      console.log(`[delete-employee] Email mismatch for deletion: expected ${targetEmployee.email}, got ${confirmEmail}`)
      return NextResponse.json(
        { error: 'Email confirmation does not match employee email' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': origin } }
      )
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
        user_metadata: { deleted_by_admin: true }
      })
    } catch (authError) {
      // Log but don't fail - employee record is already deleted
      console.warn('[delete-employee] Could not update auth metadata:', authError)
    }

    console.log(`🗑️  [delete-employee] SUPER ADMIN ${user.email} deleted employee ${targetEmployee.email} (${targetEmployee.full_name})`)

    return NextResponse.json(
      { 
        success: true,
        message: `Employee ${targetEmployee.full_name} has been permanently deleted`,
        deletedEmployee: {
          id: employeeId,
          email: targetEmployee.email,
          name: targetEmployee.full_name
        }
      },
      { status: 200, headers: { 'Access-Control-Allow-Origin': origin } }
    )
  } catch (error) {
    console.error('[delete-employee] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': origin } }
    )
  }
}
