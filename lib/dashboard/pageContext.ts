import { redirect } from 'next/navigation'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

type RelatedName = {
  name?: string | null
}

type DashboardPageLocation = RelatedName & {
  id?: string | null
  branch_code?: string | null
  timezone?: string | null
  appointments_enabled?: boolean | null
}

type EmployeePageContextRow = {
  email?: string | null
  full_name?: string | null
  roles?: RelatedName | RelatedName[] | null
  locations?: DashboardPageLocation | DashboardPageLocation[] | null
}

function firstRelated<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null
}

/**
 * Load the shared authenticated identity used by dashboard server pages.
 *
 * The returned Supabase client remains scoped to the signed-in user so page
 * queries continue to enforce their source module's row-level security.
 */
export async function loadDashboardPageContext() {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  const { data } = await supabase
    .from('employees')
    .select(
      'email, full_name, roles(name), locations(id, name, branch_code, timezone, appointments_enabled)',
    )
    .eq('id', user.id)
    .single()

  const employee = data as EmployeePageContextRow | null
  const role = firstRelated(employee?.roles)
  const location = firstRelated(employee?.locations)
  const authDisplayName =
    typeof user.user_metadata?.full_name === 'string'
      ? user.user_metadata.full_name.trim()
      : undefined

  return {
    supabase,
    userId: user.id,
    userEmail: user.email || undefined,
    userMetadata: user.user_metadata,
    employeeEmail: employee?.email || undefined,
    employeeName: employee?.full_name || authDisplayName || undefined,
    role: role?.name || undefined,
    location: location || undefined,
  }
}
