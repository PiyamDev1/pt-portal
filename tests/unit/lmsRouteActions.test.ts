import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  const ensureInstallmentsTableExists = vi.fn(async () => undefined)
  const createInstallmentRecords = vi.fn(async () => undefined)
  const createDetailedInstallmentRecords = vi.fn(async () => undefined)
  return {
    from,
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
    const txInsert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }))

    const loanSingle = vi.fn(async () => ({
      data: { current_balance: 500 },
      error: null,
    }))
    const loanSelectEq = vi.fn(() => ({ single: loanSingle }))
    const loanSelect = vi.fn(() => ({ eq: loanSelectEq }))

    const loanUpdateEq = vi.fn(async () => ({ error: null }))
    const loanUpdate = vi.fn(() => ({ eq: loanUpdateEq }))

    mocks.from.mockImplementation((table: string) => {
      if (table === 'loan_transactions') {
        return { insert: txInsert }
      }
      if (table === 'loans') {
        return {
          select: loanSelect,
          update: loanUpdate,
        }
      }
      throw new Error(`Unexpected table: ${table}`)
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
    expect(txInsert).toHaveBeenCalledTimes(1)

    const insertedPayment =
      (txInsert.mock.calls.at(0)?.[0] ?? null) as Record<string, unknown> | null
    expect(insertedPayment).not.toBeNull()
    expect(insertedPayment?.loan_id).toBe('loan-1')
    expect(insertedPayment?.transaction_type).toBe('payment')
    expect(insertedPayment?.amount).toBe(100)

    expect(loanSelectEq).toHaveBeenCalledWith('id', 'loan-1')
    expect(loanUpdate).toHaveBeenCalledWith({ current_balance: 400, status: 'Active' })
    expect(loanUpdateEq).toHaveBeenCalledWith('id', 'loan-1')
  })

  it('update_customer succeeds', async () => {
    const updateEq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_customers') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return { update }
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
    expect(update).toHaveBeenCalledWith({
      phone_number: '07700',
      email: 'a@example.com',
      address: '1 Road',
      date_of_birth: undefined,
      notes: undefined,
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'cust-1')
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
    expect(payload).toEqual({ error: 'Auth code required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('create_customer inserts a new customer and returns customerId', async () => {
    const single = vi.fn(async () => ({
      data: { id: 'cust-new' },
      error: null,
    }))
    const select = vi.fn(() => ({ single }))
    const insert = vi.fn((row: Record<string, unknown>) => ({
      select,
    }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_customers') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return { insert }
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
    expect(insert).toHaveBeenCalledTimes(1)
    const inserted = (insert.mock.calls.at(0)?.[0] ?? null) as Record<string, unknown> | null
    expect(inserted).not.toBeNull()
    expect(inserted?.first_name).toBe('Jane')
    expect(inserted?.last_name).toBe('Smith')
    expect(inserted?.link_status).toBe('New Entry')
  })

  afterAll(() => {
    process.env = originalEnv
  })
})
