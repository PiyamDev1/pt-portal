import type { SupabaseClient } from '@supabase/supabase-js'

type RelatedDepartment = {
  name?: string | null
}

export type DepartmentMembershipRow = {
  departments?: RelatedDepartment | RelatedDepartment[] | null
}

function relatedDepartmentName(value: DepartmentMembershipRow['departments']): string | undefined {
  return Array.isArray(value) ? value[0]?.name || undefined : value?.name || undefined
}

export function extractDepartmentNames(memberships: DepartmentMembershipRow[] | null | undefined) {
  return (memberships || [])
    .map((membership) => relatedDepartmentName(membership.departments))
    .filter((name): name is string => Boolean(name))
}

/**
 * Load the current employee's department names without making an access decision.
 *
 * Callers provide the correctly scoped Supabase client and decide whether a
 * query error should fail closed or degrade to an empty capability list.
 */
export async function loadEmployeeDepartmentNames(supabase: SupabaseClient, employeeId: string) {
  const { data, error } = await supabase
    .from('employee_departments')
    .select('departments(name)')
    .eq('employee_id', employeeId)

  return {
    departmentNames: extractDepartmentNames(data as DepartmentMembershipRow[] | null),
    error,
  }
}
