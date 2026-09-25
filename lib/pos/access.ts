import type { StaffSession } from '@/lib/auth/staffSession'
import { isSuperAdmin } from '@/lib/auth/superAdmin'

function normalized(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

export function posPermissions(access: StaffSession) {
  const role = normalized(access.employee.role)
  const canManage = ['master admin', 'super admin', 'admin', 'manager'].includes(role)
  const canViewCrossBranch = ['master admin', 'super admin'].includes(role)
  return {
    canPost: true,
    canManage,
    canApprove: canManage,
    canImport: canManage,
    canViewCrossBranch,
    isSuperAdmin: isSuperAdmin(access.employee.role),
  }
}

export function isPosManager(access: StaffSession) {
  return posPermissions(access).canManage
}
