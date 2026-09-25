/**
 * Platform-wide Master Admin workflow policy.
 *
 * This is deliberately a server-enforced role check at each protected route.
 * The default reason preserves the immutable audit record without asking a
 * Master Admin to type an explanation for an authorised operational action.
 */
export const SUPER_ADMIN_AUDIT_REASON = 'Master Admin override'

export function normalizeStaffRole(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

export function isSuperAdmin(role: unknown) {
  const normalized = normalizeStaffRole(role)
  return normalized === 'super admin' || normalized === 'master admin'
}
