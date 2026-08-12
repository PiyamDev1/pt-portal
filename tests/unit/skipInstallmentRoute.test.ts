import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireLmsStaff: vi.fn(),
  verifyLmsDestructiveAction: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsStaff: mocks.requireLmsStaff,
  verifyLmsDestructiveAction: mocks.verifyLmsDestructiveAction,
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { POST } from '@/app/api/lms/skip-installment/route'

describe('/api/lms/skip-installment route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLmsStaff.mockResolvedValue({
      authorized: true,
      user: { id: 'user-1', email: 'staff@example.com' },
      employee: {
        id: 'staff-1',
        email: 'staff@example.com',
        fullName: 'Test Staff',
        role: 'Master Admin',
        departments: [],
      },
    })
    mocks.verifyLmsDestructiveAction.mockResolvedValue(null)
  })

  it('returns 400 when installmentId is missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/lms/skip-installment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'installmentId is required' })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns 404 when the installment does not exist', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'P0002', message: 'Installment not found' },
    }))
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc })

    const response = await POST(
      new Request('http://localhost/api/lms/skip-installment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: 'inst-404', verificationCode: '123456' }),
      }),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Installment not found' })
  })

  it('skips and redistributes the plan in one RPC', async () => {
    const result = {
      skippedInstallmentId: 'inst-1',
      remainingBalance: 800,
      remainingInstallments: 1,
      newAmountPerInstallment: 800,
    }
    const rpc = vi.fn(async () => ({ data: result, error: null }))
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc })

    const response = await POST(
      new Request('http://localhost/api/lms/skip-installment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installmentId: 'inst-1', verificationCode: '123456' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(result)
    expect(rpc).toHaveBeenCalledWith('lms_skip_installment', { p_installment_id: 'inst-1' })
  })
})
