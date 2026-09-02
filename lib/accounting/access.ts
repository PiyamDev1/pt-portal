import { NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { ADMIN_ROLES, requireStaffSession, type StaffSession } from '@/lib/auth/staffSession'

const ACCOUNTING_DEPARTMENTS = new Set(['accounting', 'accounts'])
const ACCOUNTING_ADMIN_ROLES = new Set(ADMIN_ROLES.map(normalizeAccessName))

export type AccountingAccessResult =
  | ({
      authorized: true
      response?: never
      supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>
    } & StaffSession)
  | { authorized: false; response: NextResponse }

function normalizeAccessName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Require Accounting membership or a portal administration role.
 *
 * Department membership comes from requireStaffSession's employee_departments
 * lookup. The authenticated route client is retained for Accounting RPCs so
 * the database can independently authorize auth.uid() and enforce reviewer
 * separation-of-duties rules.
 */
export async function requireAccountingAccess(): Promise<AccountingAccessResult> {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) {
    access.response.headers.set('Cache-Control', 'private, no-store, max-age=0')
    return access
  }

  const hasAccountingDepartment = access.employee.departments.some((department) =>
    ACCOUNTING_DEPARTMENTS.has(normalizeAccessName(department)),
  )
  const hasAdminRole = ACCOUNTING_ADMIN_ROLES.has(normalizeAccessName(access.employee.role))

  if (!hasAccountingDepartment && !hasAdminRole) {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Forbidden' },
        { status: 403, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
      ),
    }
  }

  try {
    return {
      ...access,
      authorized: true,
      supabase: await getRouteSupabaseClient(),
    }
  } catch {
    return {
      authorized: false,
      response: NextResponse.json(
        { error: 'Unable to initialize Accounting access' },
        { status: 500, headers: { 'Cache-Control': 'private, no-store, max-age=0' } },
      ),
    }
  }
}
