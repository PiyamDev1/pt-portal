type RelatedName = {
  name?: string | null
  branch_code?: string | null
}

type EmployeeHeaderRow = {
  full_name?: string | null
  roles?: RelatedName | RelatedName[] | null
  locations?: RelatedName | RelatedName[] | null
}

function firstRelated(value: RelatedName | RelatedName[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null
}

export async function getPackagePageHeader(
  supabase: { from: (table: string) => any },
  userId: string,
  fallbackName?: string | null,
) {
  const { data } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', userId)
    .single() as { data: EmployeeHeaderRow | null }

  const role = firstRelated(data?.roles)
  const location = firstRelated(data?.locations)

  return {
    employeeName: data?.full_name || fallbackName || undefined,
    role: role?.name || 'Employee',
    location: location || undefined,
  }
}
