/**
 * Issue Report Authorization Utilities
 * Verifies user permissions for accessing and creating issue reports
 *
 * @module lib/issueReportAuth
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { requireStaffSession } from '@/lib/auth/staffSession'

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
  const access = await requireStaffSession({ roles: ['Master Admin'] })
  if (!access.authorized) {
    const payload = (await access.response
      .clone()
      .json()
      .catch(() => null)) as { error?: string } | null
    return {
      authorized: false,
      status: access.response.status,
      error: payload?.error || (access.response.status === 401 ? 'Unauthorized' : 'Forbidden'),
    }
  }

  return {
    authorized: true,
    status: 200,
    user: {
      id: access.user.id,
      email: access.user.email,
      name: access.employee.fullName,
      role: access.employee.role,
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
    },
  )

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

  const adminSupabase = getSupabaseClient()
  const { data: employeeData } = await adminSupabase
    .from('employees')
    .select('id, full_name')
    .eq('id', user.id)
    .maybeSingle()

  const employee = employeeData as { id: string; full_name: string | null } | null

  return {
    id: user.id,
    email: user.email || null,
    name: employee?.full_name || user.email || 'Unknown User',
  }
}
