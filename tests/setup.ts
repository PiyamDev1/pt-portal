import { vi } from 'vitest'

/**
 * Route unit tests exercise handler behavior in isolation. Authentication and
 * fresh-2FA have dedicated tests, so handlers receive a valid staff session by
 * default; individual authorization tests override these module mocks.
 */
vi.mock('@/lib/auth/staffSession', () => ({
  ADMIN_ROLES: ['Admin', 'Master Admin', 'Super Admin'],
  MAINTENANCE_ROLES: ['Maintenance Admin', 'Admin', 'Master Admin', 'Super Admin'],
  requireStaffSession: vi.fn(async () => ({
    authorized: true,
    user: { id: 'u-1', email: 'staff@example.com' },
    employee: {
      id: 'u-1',
      email: 'staff@example.com',
      fullName: 'Test Staff',
      role: 'Master Admin',
      departments: [],
    },
  })),
}))

vi.mock('@/lib/auth/freshSecondFactor', () => ({
  verifyFreshSecondFactor: vi.fn(async () => ({ verified: true, method: 'totp' })),
  consumeBackupCodeAtomically: vi.fn(async () => ({ consumed: true, codeId: 'backup-1' })),
}))

vi.mock('@/lib/security/rateLimit', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  enforceRateLimit: vi.fn(async () => ({
    allowed: true,
    remaining: 9,
    retryAfterSeconds: 0,
  })),
}))
