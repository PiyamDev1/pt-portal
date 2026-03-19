type RoleLike = { name?: string } | { name?: string }[] | null | undefined

const MAINTENANCE_TIMELOCK_ROLES = ['maintenance admin', 'admin', 'master admin', 'super admin']

export function normalizeRoleName(roleName: string | null | undefined) {
  return (roleName || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
}

export function getRoleName(role: RoleLike) {
  if (!role) return null
  return Array.isArray(role) ? role[0]?.name || null : role.name || null
}

export function pickRoleName(...roleCandidates: Array<string | null | undefined>) {
  for (const candidate of roleCandidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return null
}

export function hasManagerTimeclockAccess(
  roleName: string | null | undefined,
  reportCount: number | null | undefined,
) {
  const normalizedRole = normalizeRoleName(roleName)
  const hasReports = (reportCount || 0) > 0

  return normalizedRole === 'master admin' || normalizedRole.includes('manager') || hasReports
}

export function hasMaintenanceTimeclockAccess(roleName: string | null | undefined) {
  return MAINTENANCE_TIMELOCK_ROLES.includes(normalizeRoleName(roleName))
}
