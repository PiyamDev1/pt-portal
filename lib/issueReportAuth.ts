import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getSupabaseClient } from '@/lib/supabaseClient'

type AdminAuthResult = {
  authorized: boolean
  status: number
  error?: string
  user?: {
    id: string
    email: string
    name: string
    role: string
  }
}

export async function verifyMasterAdminSession(): Promise<AdminAuthResult> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { authorized: false, status: 401, error: 'Unauthorized' }
  }

  const adminSupabase = getSupabaseClient()
  const { data: employeeData } = await adminSupabase
    .from('employees')
    .select('id, full_name, role_id')
    .eq('id', session.user.id)
    .single()

  const employee = employeeData as { id: string; full_name: string | null; role_id: string } | null

  if (!employee) {
    return { authorized: false, status: 403, error: 'Employee profile not found' }
  }

  const { data: roleData } = await adminSupabase
    .from('roles')
    .select('name')
    .eq('id', employee.role_id)
    .single()

  const role = roleData as { name: string } | null

  if (!role || role.name !== 'Master Admin') {
    return { authorized: false, status: 403, error: 'Master Admin access required' }
  }

  return {
    authorized: true,
    status: 200,
    user: {
      id: session.user.id,
      email: session.user.email || '',
      name: employee.full_name || session.user.email || 'Master Admin',
      role: role.name,
    },
  }
}

export async function getOptionalIssueReporter() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return null
  }

  const adminSupabase = getSupabaseClient()
  const { data: employeeData } = await adminSupabase
    .from('employees')
    .select('id, full_name')
    .eq('id', session.user.id)
    .maybeSingle()

  const employee = employeeData as { id: string; full_name: string | null } | null

  return {
    id: session.user.id,
    email: session.user.email || null,
    name: employee?.full_name || session.user.email || 'Unknown User',
  }
}
