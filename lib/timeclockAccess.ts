/**
 * Timeclock Access Control Utilities
 * Determines user permissions for timeclock features based on roles
 * 
 * @module lib/timeclockAccess
 */

type RoleLike = { name?: string } | { name?: string }[] | null | undefined

const MAINTENANCE_TIMELOCK_ROLES = ['maintenance admin', 'admin', 'master admin', 'super admin']

/**
 * Normalize role name for consistent comparison
 * @param roleName The role name to normalize
 * @returns Normalized role name (lowercase, spaces instead of underscores/hyphens)
 */
export function normalizeRoleName(roleName: string | null | undefined) {
  return (roleName || '').trim().toLowerCase().replace(/[_-]+/g, ' ')
}

/**
 * Extract role name from role object or array
 * @param role Role object or array of role objects
 * @returns The role name or null if not found
 */
export function getRoleName(role: RoleLike) {
  if (!role) return null
  return Array.isArray(role) ? role[0]?.name || null : role.name || null
}

/**
 * Pick the first non-empty role name from candidates
 * @param roleCandidates Variable number of role name candidates
 * @returns First non-empty role name or null
 */
export function pickRoleName(...roleCandidates: Array<string | null | undefined>) {
  for (const candidate of roleCandidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return null
}

/**
 * Check if user has manager-level timeclock access
 * Managers can view and manage their team's timeclock records
 * @param roleName The user's role name
 * @param reportCount Number of employees under this user (for indirect role detection)
 * @returns True if user has manager timeclock access
 */
export function hasManagerTimeclockAccess(
  roleName: string | null | undefined,
  reportCount: number | null | undefined,
) {
  const normalizedRole = normalizeRoleName(roleName)
  const hasReports = (reportCount || 0) > 0

  return normalizedRole === 'master admin' || normalizedRole.includes('manager') || hasReports
}

/**
 * Check if user has maintenance timeclock access
 * Maintenance admins can manage timeclock system-wide
 * @param roleName The user's role name
 * @returns True if user has maintenance/admin timeclock access
 */
export function hasMaintenanceTimeclockAccess(roleName: string | null | undefined) {
  return MAINTENANCE_TIMELOCK_ROLES.includes(normalizeRoleName(roleName))
}
