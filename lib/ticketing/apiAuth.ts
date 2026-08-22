import { NextResponse } from 'next/server'
import { requireStaffSession, type StaffSession } from '@/lib/auth/staffSession'

export const TICKETING_DEPARTMENT = 'Ticketing'
export const TICKETING_OVERSIGHT_ROLES = [
  'Manager',
  'Admin',
  'Master Admin',
  'Super Admin',
] as const

export type TicketingAccessScope = 'own' | 'team'

export type TicketingAccess = {
  authorized: true
  response?: never
  scope: TicketingAccessScope
} & StaffSession

export type TicketingAccessResult = TicketingAccess | { authorized: false; response: NextResponse }

function normalizeAccessName(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

export function isTicketingOversightRole(role: unknown) {
  const normalizedRole = normalizeAccessName(role)
  return TICKETING_OVERSIGHT_ROLES.some(
    (allowedRole) => normalizeAccessName(allowedRole) === normalizedRole,
  )
}

export function hasTicketingDepartment(departments: readonly string[]) {
  const normalizedDepartment = normalizeAccessName(TICKETING_DEPARTMENT)
  return departments.some((department) => normalizeAccessName(department) === normalizedDepartment)
}

export function resolveTicketingAccessScope(
  role: unknown,
  departments: readonly string[],
): TicketingAccessScope | null {
  if (isTicketingOversightRole(role)) return 'team'
  return hasTicketingDepartment(departments) ? 'own' : null
}

/**
 * Verify Ticketing access and derive the record scope server-side.
 *
 * Ticketing department members work only with their own private records.
 * Ticketing oversight is deliberately separate from the portal-wide admin and
 * maintenance role sets because Managers are included and Maintenance Admins
 * receive no Ticketing access unless explicitly assigned to the department.
 */
export async function requireTicketingAccess(): Promise<TicketingAccessResult> {
  const access = await requireStaffSession({ includeDepartments: true })
  if (!access.authorized) return access

  const scope = resolveTicketingAccessScope(access.employee.role, access.employee.departments)
  if (!scope) {
    return {
      authorized: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    }
  }

  return { ...access, scope }
}
