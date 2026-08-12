import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const rpc = vi.fn()
  const createClient = vi.fn(() => ({ from, rpc }))
  const ensureInstallmentsTableExists = vi.fn(async () => undefined)
  const createInstallmentRecords = vi.fn(async () => undefined)
  const createDetailedInstallmentRecords = vi.fn(async () => undefined)
  return {
    from,
    rpc,
    createClient,
    ensureInstallmentsTableExists,
    createInstallmentRecords,
    createDetailedInstallmentRecords,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/installmentsDb', () => ({
  ensureInstallmentsTableExists: mocks.ensureInstallmentsTableExists,
  createInstallmentRecords: mocks.createInstallmentRecords,
  createDetailedInstallmentRecords: mocks.createDetailedInstallmentRecords,
}))
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsStaff: vi.fn(async () => ({
    authorized: true,
    user: { id: 'emp-server' },
    employee: { id: 'emp-server' },
  })),
  getLmsIdempotencyKey: vi.fn(() => null),
  verifyLmsDestructiveAction: vi.fn(async (_access, input) =>
    input.verificationCode
      ? null
      : Response.json({ error: 'Verification code required' }, { status: 403 }),
  ),
}))

import { POST } from '@/app/api/lms/route'

describe('/api/lms route POST actions', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const request = new Request('http://localhost/api/lms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record_payment' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toContain('Supabase not configured')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid action', async () => {
    const request = new Request('http://localhost/api/lms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unknown_action' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Invalid action' })
  })

  it('returns 400 for add_fee when amount is invalid', async () => {
    const request = new Request('http://localhost/api/lms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'add_fee',
        amount: '0',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Valid fee amount required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('records payment and updates loan balance', async () => {
    mocks.rpc.mockResolvedValue({
      data: { recordedPaymentLoanId: 'loan-1' },
      error: null,
    })

    const request = new Request('http://localhost/api/lms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'record_payment',
        loanId: 'loan-1',
        employeeId: 'emp-1',
        amount: '100',
        paymentMethodId: 'pm-1',
        notes: 'paid cash',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ recordedPaymentLoanId: 'loan-1' })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'lms_record_payment',
      expect.objectContaining({
        p_loan_id: 'loan-1',
        p_employee_id: 'emp-server',
        p_amount: 100,
      }),
    )
  })

  it('maps a missing payment loan to 404', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: 'Loan not found' },
    })

    const response = await POST(
      new Request('http://localhost/api/lms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'record_payment', loanId: 'missing', amount: 100 }),
      }),
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Loan not found' })
  })

  it('update_customer succeeds', async () => {
    mocks.rpc.mockResolvedValue({
      data: { updatedCustomerId: 'cust-1' },
      error: null,
    })

    const request = new Request('http://localhost/api/lms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update_customer',
        customerId: 'cust-1',
        phone: '07700',
        email: 'a@example.com',
        address: '1 Road',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ updatedCustomerId: 'cust-1' })
    expect(mocks.rpc).toHaveBeenCalledWith('lms_update_customer', {
      p_customer_id: 'cust-1',
      p_actor_id: 'emp-server',
      p_updates: {
        phone: '07700',
        email: 'a@example.com',
        address: '1 Road',
      },
      p_note: null,
    })
  })

  it('delete_customer returns 403 when authCode is missing', async () => {
    const request = new Request('http://localhost/api/lms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'delete_customer',
        customerId: 'cust-1',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Verification code required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('create_customer inserts a new customer and returns customerId', async () => {
    mocks.rpc.mockResolvedValue({
      data: { customerId: 'cust-new' },
      error: null,
    })

    const request = new Request('http://localhost/api/lms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create_customer',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '07700900000',
        email: 'jane@example.com',
        address: '2 Main St',
        employeeId: 'emp-1',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ customerId: 'cust-new' })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'lms_create_customer',
      expect.objectContaining({
        p_actor_id: 'emp-server',
        p_first_name: 'Jane',
        p_last_name: 'Smith',
      }),
    )
  })

  afterAll(() => {
    process.env = originalEnv
  })
})
