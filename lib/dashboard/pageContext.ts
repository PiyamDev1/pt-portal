import { redirect } from 'next/navigation'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

type RelatedName = {
  name?: string | null
  branch_code?: string | null
}

type EmployeePageContextRow = {
  full_name?: string | null
  roles?: RelatedName | RelatedName[] | null
  locations?: RelatedName | RelatedName[] | null
}

function firstRelated(value: RelatedName | RelatedName[] | null | undefined) {
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
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) redirect('/login')

  const { data } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const employee = data as EmployeePageContextRow | null
  const role = firstRelated(employee?.roles)
  const location = firstRelated(employee?.locations)

  return {
    supabase,
    userId: session.user.id,
    employeeName: employee?.full_name || undefined,
    role: role?.name || undefined,
    location: location || undefined,
  }
}
