/**
 * Platform-wide Super Admin workflow policy.
 *
 * This is deliberately a server-enforced role check at each protected route.
 * The default reason preserves the immutable audit record without asking a
 * Super Admin to type an explanation for an authorised operational action.
 */
export const SUPER_ADMIN_AUDIT_REASON = 'Super Admin override'

export function normalizeStaffRole(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

export function isSuperAdmin(role: unknown) {
  return normalizeStaffRole(role) === 'super admin'
}
