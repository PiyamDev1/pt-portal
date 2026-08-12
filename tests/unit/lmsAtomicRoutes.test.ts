import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  requireLmsStaff: vi.fn(),
  verifyLmsDestructiveAction: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/lms/apiAuth', () => ({
  getLmsIdempotencyKey: (request: Request, body?: Record<string, unknown>) =>
    request.headers.get('idempotency-key') || body?.idempotencyKey || null,
  requireLmsStaff: mocks.requireLmsStaff,
  verifyLmsDestructiveAction: mocks.verifyLmsDestructiveAction,
}))
vi.mock('@/lib/installmentsDb', () => ({
  ensureInstallmentsTableExists: vi.fn(),
  createInstallmentRecords: vi.fn(),
  createDetailedInstallmentRecords: vi.fn(),
}))

import { POST as lmsPost } from '@/app/api/lms/route'

describe('LMS atomic mutation contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.requireLmsStaff.mockResolvedValue({
      authorized: true,
      user: { id: 'auth-user', email: 'staff@example.com' },
      employee: { id: 'employee-server', email: '', fullName: 'Staff', role: '', departments: [] },
    })
    mocks.verifyLmsDestructiveAction.mockResolvedValue(null)
  })

  it('blocks service-role access before creating a client when there is no staff session', async () => {
    mocks.requireLmsStaff.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await lmsPost(
      new Request('http://localhost/api/lms', {
        method: 'POST',
        body: JSON.stringify({ action: 'record_payment', loanId: 'loan-1', amount: 50 }),
      }),
    )

    expect(response.status).toBe(401)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('passes payment, authenticated actor, and idempotency key to one RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { recordedPaymentLoanId: 'loan-1', newBalance: 450, idempotentReplay: false },
      error: null,
    }))
    mocks.createClient.mockReturnValue({ rpc })

    const response = await lmsPost(
      new Request('http://localhost/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'pay-click-1' },
        body: JSON.stringify({
          action: 'record_payment',
          loanId: 'loan-1',
          amount: 50,
          employeeId: 'spoofed-browser-id',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'lms_record_payment',
      expect.objectContaining({
        p_loan_id: 'loan-1',
        p_employee_id: 'employee-server',
        p_amount: 50,
        p_idempotency_key: 'pay-click-1',
      }),
    )
  })

  it('creates a service, installments, and deposit through one idempotent RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { createdLoanId: 'loan-new', serviceTransactionId: 'service-1' },
      error: null,
    }))
    mocks.createClient.mockReturnValue({ rpc })

    const response = await lmsPost(
      new Request('http://localhost/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'service-click-1' },
        body: JSON.stringify({
          action: 'add_service',
          customerId: 'customer-1',
          serviceAmount: 500,
          initialDeposit: 100,
          installmentTerms: 2,
          installmentPlan: [
            { dueDate: '2026-09-01', amount: 200 },
            { dueDate: '2026-10-01', amount: 200 },
          ],
          transactionDate: '2026-08-12',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'lms_add_service',
      expect.objectContaining({
        p_customer_id: 'customer-1',
        p_actor_id: 'employee-server',
        p_service_amount: 500,
        p_initial_deposit: 100,
        p_installment_plan: [
          { dueDate: '2026-09-01', amount: 200 },
          { dueDate: '2026-10-01', amount: 200 },
        ],
        p_idempotency_key: 'service-click-1',
      }),
    )
  })

  it('adds a fee and recalculates its loan through one RPC', async () => {
    const rpc = vi.fn(async () => ({ data: { loanId: 'loan-1', feeAdded: 25 }, error: null }))
    mocks.createClient.mockReturnValue({ rpc })

    const response = await lmsPost(
      new Request('http://localhost/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'fee-click-1' },
        body: JSON.stringify({
          action: 'add_fee',
          customerId: 'customer-1',
          loanId: 'loan-1',
          amount: 25,
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'lms_add_fee',
      expect.objectContaining({
        p_actor_id: 'employee-server',
        p_amount: 25,
        p_idempotency_key: 'fee-click-1',
      }),
    )
  })

  it('creates a customer and initial debt through one idempotent RPC', async () => {
    const rpc = vi.fn(async () => ({ data: { customerId: 'customer-new' }, error: null }))
    mocks.createClient.mockReturnValue({ rpc })

    const response = await lmsPost(
      new Request('http://localhost/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'customer-click-1' },
        body: JSON.stringify({
          action: 'create_customer',
          firstName: 'Aisha',
          lastName: 'Khan',
          initialTransaction: { type: 'service', amount: 300, notes: 'Initial service' },
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(
      'lms_create_customer',
      expect.objectContaining({
        p_actor_id: 'employee-server',
        p_first_name: 'Aisha',
        p_initial_transaction: { type: 'service', amount: 300, notes: 'Initial service' },
        p_idempotency_key: 'customer-click-1',
      }),
    )
  })

  it('verifies a fresh factor and deletes a customer in one RPC', async () => {
    const rpc = vi.fn(async () => ({ data: { deletedCustomerId: 'customer-1' }, error: null }))
    mocks.createClient.mockReturnValue({ rpc })
    const response = await lmsPost(
      new Request('http://localhost/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_customer',
          customerId: 'customer-1',
          authCode: '123456',
        }),
      }),
    )

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('lms_delete_customer', {
      p_customer_id: 'customer-1',
      p_actor_id: 'employee-server',
    })
  })
})
