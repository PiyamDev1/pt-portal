import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireStaffSession: vi.fn(),
}))

vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

import { verifyMasterAdminSession } from '@/lib/issueReportAuth'

describe('issue-report admin authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('accepts the same Master and Super Admin roles exposed by Settings', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      employee: { fullName: 'Admin User', role: 'Super Admin' },
    })

    await expect(verifyMasterAdminSession()).resolves.toMatchObject({
      authorized: true,
      user: { id: 'admin-1', role: 'Super Admin' },
    })
    expect(mocks.requireStaffSession).toHaveBeenCalledWith({
      roles: ['Master Admin', 'Super Admin'],
    })
  })
})
