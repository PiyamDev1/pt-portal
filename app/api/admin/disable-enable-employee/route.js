import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

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
    const { employeeId, isActive } = body

    if (!employeeId || typeof isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'Missing or invalid parameters: employeeId and isActive required' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': origin } }
      )
    }

    // 3. Get current user's role and manager info
    const { data: currentUser, error: userError } = await supabaseAdmin
      .from('employees')
      .select('id, manager_id, roles(name)')
      .eq('id', user.id)
      .single()

    if (userError || !currentUser) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404, headers: { 'Access-Control-Allow-Origin': origin } }
      )
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
        console.log(`[disable-enable-employee] Unauthorized: ${user.email} tried to modify ${employeeId}`)
        return NextResponse.json(
          { error: 'Unauthorized: Only managers or super admin can disable/enable employees' },
          { status: 403, headers: { 'Access-Control-Allow-Origin': origin } }
        )
      }
    }

    // 5. Don't allow disabling yourself
    if (user.id === employeeId && !isActive) {
      return NextResponse.json(
        { error: 'Cannot disable your own account' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': origin } }
      )
    }

    // 6. Update employee status
    const { error: updateError } = await supabaseAdmin
      .from('employees')
      .update({ is_active: isActive })
      .eq('id', employeeId)

    if (updateError) throw updateError

    const status = isActive ? 'enabled' : 'disabled'
    console.log(`[disable-enable-employee] ${user.email} ${status} employee ${employeeId}`)

    return NextResponse.json(
      { 
        success: true,
        message: `Employee ${status} successfully`,
        isActive
      },
      { status: 200, headers: { 'Access-Control-Allow-Origin': origin } }
    )
  } catch (error) {
    console.error('[disable-enable-employee] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: { 'Access-Control-Allow-Origin': origin } }
    )
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
