import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireSuperAdminSession = vi.fn()
  const verifyFreshSecondFactor = vi.fn()
  const recordAuthSecurityEvent = vi.fn()
  const recordAuthSecurityEventStrict = vi.fn()
  const enforceRateLimit = vi.fn()
  const employeeMaybeSingle = vi.fn()
  const employeeEq = vi.fn(() => ({ maybeSingle: employeeMaybeSingle }))
  const employeeSelect = vi.fn(() => ({ eq: employeeEq }))
  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))
  const deleteEq = vi.fn()
  const deleteRows = vi.fn(() => ({ eq: deleteEq }))
  const from = vi.fn((table: string) =>
    table === 'employees'
      ? { select: employeeSelect, update }
      : table === 'backup_codes'
        ? { delete: deleteRows }
        : {},
  )
  const listFactors = vi.fn()
  const deleteFactor = vi.fn()
  const createClient = vi.fn(() => ({
    from,
    auth: { admin: { mfa: { listFactors, deleteFactor } } },
  }))
  return {
    requireSuperAdminSession,
    verifyFreshSecondFactor,
    recordAuthSecurityEvent,
    recordAuthSecurityEventStrict,
    enforceRateLimit,
    employeeMaybeSingle,
    employeeEq,
    employeeSelect,
    updateEq,
    update,
    deleteEq,
    deleteRows,
    from,
    listFactors,
    deleteFactor,
    createClient,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireSuperAdminSession: mocks.requireSuperAdminSession,
}))
vi.mock('@/lib/auth/freshSecondFactor', () => ({
  verifyFreshSecondFactor: mocks.verifyFreshSecondFactor,
}))
vi.mock('@/lib/auth/securityEvents', () => ({
  recordAuthSecurityEvent: mocks.recordAuthSecurityEvent,
  recordAuthSecurityEventStrict: mocks.recordAuthSecurityEventStrict,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '127.0.0.1',
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/admin/recover-employee-2fa/route'

const targetId = '22222222-2222-4222-8222-222222222222'
const adminId = '11111111-1111-4111-8111-111111111111'
const makeRequest = (overrides: Record<string, unknown> = {}) =>
  new Request('https://portal.test/api/admin/recover-employee-2fa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      employeeId: targetId,
      confirmEmail: 'target@example.com',
      reason: 'User lost access to both registered factors',
      verificationCode: '123456',
      verificationMethod: 'totp',
      ...overrides,
    }),
  })

describe('POST /api/admin/recover-employee-2fa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSuperAdminSession.mockResolvedValue({
      authorized: true,
      user: { id: adminId, email: 'admin@example.com' },
      employee: { id: adminId, role: 'Master Admin' },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 })
    mocks.verifyFreshSecondFactor.mockResolvedValue({ verified: true, method: 'totp' })
    mocks.employeeMaybeSingle.mockResolvedValue({
      data: { id: targetId, email: 'target@example.com', full_name: 'Target User' },
      error: null,
    })
    mocks.listFactors.mockResolvedValue({ data: { factors: [{ id: 'factor-1' }] }, error: null })
    mocks.deleteFactor.mockResolvedValue({ error: null })
    mocks.deleteEq.mockResolvedValue({ error: null })
    mocks.updateEq.mockResolvedValue({ error: null })
  })

  it('requires a Super Admin session', async () => {
    mocks.requireSuperAdminSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })
    expect((await POST(makeRequest())).status).toBe(403)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('requires the administrator fresh second factor', async () => {
    mocks.verifyFreshSecondFactor.mockResolvedValueOnce({
      verified: false,
      error: 'Invalid authenticator code',
    })
    const response = await POST(makeRequest())
    expect(response.status).toBe(403)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('does not provide the recovery path for the caller own account', async () => {
    const response = await POST(makeRequest({ employeeId: adminId }))
    expect(response.status).toBe(400)
    expect(mocks.verifyFreshSecondFactor).not.toHaveBeenCalled()
  })

  it('requires an exact target email confirmation', async () => {
    const response = await POST(makeRequest({ confirmEmail: 'wrong@example.com' }))
    expect(response.status).toBe(400)
    expect(mocks.listFactors).not.toHaveBeenCalled()
  })

  it('removes factors and backup codes, resets the flag, and audits recovery', async () => {
    const response = await POST(makeRequest())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      recoveredEmployeeId: targetId,
      employeeName: 'Target User',
      removedFactors: 1,
      requiresSetup: true,
    })
    expect(mocks.deleteFactor).toHaveBeenCalledWith({ userId: targetId, id: 'factor-1' })
    expect(mocks.deleteEq).toHaveBeenCalledWith('employee_id', targetId)
    expect(mocks.update).toHaveBeenCalledWith({ two_factor_enabled: false })
    expect(mocks.recordAuthSecurityEventStrict).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: targetId,
        status: 'started',
        metadata: expect.objectContaining({ action: 'admin_recovery', actorUserId: adminId }),
      }),
    )
    expect(mocks.recordAuthSecurityEventStrict).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: targetId,
        status: 'revoked',
        metadata: expect.objectContaining({ action: 'admin_recovery', actorUserId: adminId }),
      }),
    )
  })
})
