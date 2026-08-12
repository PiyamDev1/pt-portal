/** Role-scoped API guards built on the canonical staff-session verifier. */

import { ADMIN_ROLES, MAINTENANCE_ROLES, requireStaffSession } from '@/lib/auth/staffSession'

export function requireAdminSession() {
  return requireStaffSession({ roles: [...ADMIN_ROLES] })
}

export function requireMaintenanceSession() {
  return requireStaffSession({ roles: [...MAINTENANCE_ROLES] })
}

export function requireSuperAdminSession() {
  return requireStaffSession({ roles: ['Master Admin', 'Super Admin'] })
}
