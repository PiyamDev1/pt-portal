import { NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

type RelatedName = { name?: string | null }

type EmployeeRow = {
  id: string
  email?: string | null
  full_name?: string | null
  is_active?: boolean | null
  roles?: RelatedName | RelatedName[] | null
}

type DepartmentMembershipRow = {
  departments?: RelatedName | RelatedName[] | null
}

export type StaffSession = {
  user: {
    id: string
    email: string
  }
  employee: {
    id: string
    email: string
    fullName: string
    role: string
    departments: string[]
  }
}

export type StaffSessionOptions = {
  roles?: string[]
  departments?: string[]
  includeDepartments?: boolean
  activeOnly?: boolean
}

type StaffSessionResult =
  | ({ authorized: true; response?: never } & StaffSession)
  | { authorized: false; response: NextResponse }

function normalizeAccessName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function relatedName(value: RelatedName | RelatedName[] | null | undefined) {
  return Array.isArray(value) ? value[0]?.name : value?.name
}

/**
 * Authenticate an API caller and resolve their employee identity server-side.
 *
 * Service-role clients deliberately bypass RLS, so routes must call this guard
 * before using one. Caller-provided employee/user IDs are never identity proof.
 */
export async function requireStaffSession(
  options: StaffSessionOptions = {},
): Promise<StaffSessionResult> {
  try {
    const authClient = await getRouteSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await authClient.auth.getUser()

    if (authError || !user) {
      return {
        authorized: false,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      }
    }

    const serviceClient = getServiceSupabaseClient()
    const { data, error: employeeError } = await serviceClient
      .from('employees')
      .select('id, email, full_name, is_active, roles(name)')
      .eq('id', user.id)
      .maybeSingle<EmployeeRow>()

    if (employeeError || !data) {
      return {
        authorized: false,
        response: NextResponse.json({ error: 'Employee profile not found' }, { status: 403 }),
      }
    }

    if (options.activeOnly !== false && data.is_active === false) {
      return {
        authorized: false,
        response: NextResponse.json({ error: 'Employee account is inactive' }, { status: 403 }),
      }
    }

    const role = relatedName(data.roles) || ''
    const allowedRoles = (options.roles || []).map(normalizeAccessName)
    if (allowedRoles.length > 0 && !allowedRoles.includes(normalizeAccessName(role))) {
      return {
        authorized: false,
        response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      }
    }

    let departments: string[] = []
    const allowedDepartments = (options.departments || []).map(normalizeAccessName)
    if (options.includeDepartments || allowedDepartments.length > 0) {
      const { data: memberships, error: membershipError } = await serviceClient
        .from('employee_departments')
        .select('departments(name)')
        .eq('employee_id', user.id)

      if (membershipError) {
        return {
          authorized: false,
          response: NextResponse.json(
            { error: 'Unable to verify department access' },
            { status: 503 },
          ),
        }
      }

      departments = ((memberships || []) as DepartmentMembershipRow[])
        .map((membership) => relatedName(membership.departments))
        .filter((name): name is string => Boolean(name))

      if (
        allowedDepartments.length > 0 &&
        !departments.some((name) => allowedDepartments.includes(normalizeAccessName(name)))
      ) {
        return {
          authorized: false,
          response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        }
      }
    }

    return {
      authorized: true,
      user: { id: user.id, email: user.email || data.email || '' },
      employee: {
        id: data.id,
        email: data.email || user.email || '',
        fullName: data.full_name || user.email || 'Staff member',
        role,
        departments,
      },
    }
  } catch {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Unable to verify session' }, { status: 500 }),
    }
  }
}

export const ADMIN_ROLES = ['Admin', 'Master Admin', 'Super Admin'] as const
export const MAINTENANCE_ROLES = ['Maintenance Admin', ...ADMIN_ROLES] as const
