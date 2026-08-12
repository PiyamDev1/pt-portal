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

import { POST } from '@/app/api/lms/delete-installment-plan/route'

describe('/api/lms/delete-installment-plan route', () => {
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

  it('returns 400 when transactionId is missing', async () => {
    const response = await POST(
      new Request('http://localhost/api/lms/delete-installment-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Transaction ID is required' })
  })

  it('requires a fresh second factor before touching the service-role client', async () => {
    mocks.verifyLmsDestructiveAction.mockResolvedValue(
      Response.json({ error: 'Invalid authenticator code' }, { status: 403 }),
    )

    const response = await POST(
      new Request('http://localhost/api/lms/delete-installment-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: 'tx-1', verificationCode: '000000' }),
      }),
    )

    expect(response.status).toBe(403)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('deletes the plan and recalculates its loan in one RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { deletedTransactionId: 'tx-1', newBalance: 700 },
      error: null,
    }))
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc })

    const response = await POST(
      new Request('http://localhost/api/lms/delete-installment-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: 'tx-1', verificationCode: '123456' }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deletedTransactionId: 'tx-1' })
    expect(rpc).toHaveBeenCalledWith('lms_delete_installment_plan', {
      p_transaction_id: 'tx-1',
    })
  })
})
