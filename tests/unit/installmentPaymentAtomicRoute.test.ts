import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireLmsStaff: vi.fn(),
  verifyLmsDestructiveAction: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsStaff: mocks.requireLmsStaff,
  verifyLmsDestructiveAction: mocks.verifyLmsDestructiveAction,
  getLmsIdempotencyKey: (request: Request) => request.headers.get('idempotency-key'),
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { DELETE, PATCH, POST } from '@/app/api/lms/installment-payment/route'

describe('atomic installment payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLmsStaff.mockResolvedValue({
      authorized: true,
      user: { id: 'server-employee' },
      employee: { id: 'server-employee' },
    })
    mocks.verifyLmsDestructiveAction.mockResolvedValue(null)
  })

  it('records a temporary installment payment through the atomic RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { transactionId: 'pay-1', newBalance: 80 },
      error: null,
    }))
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc })

    const response = await POST(
      new Request('http://localhost/api/lms/installment-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'installment-click-1' },
        body: JSON.stringify({
          installmentId: 'temp__service-1__1',
          loanId: 'loan-1',
          serviceTransactionId: 'service-1',
          paymentAmount: 20,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'lms_record_installment_payment',
      expect.objectContaining({
        p_installment_id: null,
        p_expected_installment_number: 1,
        p_employee_id: 'server-employee',
        p_idempotency_key: 'installment-click-1',
      }),
    )
  })

  it('uses recalculating RPCs for corrections and deletes', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data:
        name === 'lms_update_payment'
          ? { updatedTransactionId: 'pay-1', newBalance: 70 }
          : { deletedTransactionId: 'pay-1', newBalance: 100 },
      error: null,
    }))
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc })

    const patchResponse = await PATCH(
      new Request('http://localhost/api/lms/installment-payment', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: 'pay-1', paymentAmount: 30 }),
      }),
    )
    const deleteResponse = await DELETE(
      new Request(
        'http://localhost/api/lms/installment-payment?transactionId=pay-1&accountId=loan-1',
        { method: 'DELETE', headers: { 'X-Verification-Code': '123456' } },
      ),
    )

    expect(patchResponse.status).toBe(200)
    expect(deleteResponse.status).toBe(200)
    expect(rpc).toHaveBeenNthCalledWith(1, 'lms_update_payment', expect.any(Object))
    expect(rpc).toHaveBeenNthCalledWith(2, 'lms_delete_payment', { p_transaction_id: 'pay-1' })
  })

  it('requires a fresh factor before deleting a payment', async () => {
    mocks.verifyLmsDestructiveAction.mockResolvedValue(
      Response.json({ error: 'Verification code required' }, { status: 403 }),
    )

    const response = await DELETE(
      new Request(
        'http://localhost/api/lms/installment-payment?transactionId=pay-1&accountId=loan-1',
        { method: 'DELETE' },
      ),
    )

    expect(response.status).toBe(403)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
