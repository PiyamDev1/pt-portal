import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireMaintenanceSession = vi.fn()

  const loanInstallmentsSelect = vi.fn()
  const loanInstallmentsInsertSelect = vi.fn()
  const loanInstallmentsInsert = vi.fn(() => ({ select: loanInstallmentsInsertSelect }))

  const loanTransactionsEq = vi.fn()
  const loanTransactionsSelect = vi.fn(() => ({ eq: loanTransactionsEq }))

  const from = vi.fn((table: string) => {
    if (table === 'loan_transactions') {
      return {
        select: loanTransactionsSelect,
      }
    }

    if (table === 'loan_installments') {
      return {
        select: loanInstallmentsSelect,
        insert: loanInstallmentsInsert,
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  const rpc = vi.fn()
  const createClient = vi.fn(() => ({ from, rpc }))

  return {
    requireMaintenanceSession,
    loanInstallmentsSelect,
    loanInstallmentsInsertSelect,
    loanInstallmentsInsert,
    loanTransactionsEq,
    loanTransactionsSelect,
    from,
    rpc,
    createClient,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireMaintenanceSession: mocks.requireMaintenanceSession,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/create-installments/route'

describe('POST /api/admin/create-installments', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mocks.requireMaintenanceSession.mockResolvedValue({
      authorized: true,
      user: { id: 'maintenance-1' },
    })

    mocks.loanInstallmentsSelect.mockImplementation((columns: string, options?: unknown) => {
      // Table existence check path
      if (columns === 'id' && options && typeof options === 'object') {
        return {
          limit: vi.fn(async () => ({ data: [], error: null })),
        }
      }

      // Existing-installments check path
      return {
        eq: vi.fn(() => ({
          limit: vi.fn(async () => ({ data: [], error: null })),
        })),
      }
    })

    mocks.loanTransactionsEq.mockResolvedValue({
      data: [
        {
          id: 'tx-1',
          amount: '120.00',
          transaction_timestamp: '2026-01-01T00:00:00.000Z',
          loan: { term_months: 2, current_balance: 120 },
        },
      ],
      error: null,
    })

    mocks.loanInstallmentsInsertSelect.mockResolvedValue({
      data: [{ id: 'i-1' }, { id: 'i-2' }],
      error: null,
    })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns auth response when maintenance session is unauthorized', async () => {
    mocks.requireMaintenanceSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(new Request('http://localhost/api/admin/create-installments'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await POST(new Request('http://localhost/api/admin/create-installments'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns manual setup guidance when table creation RPC is unavailable', async () => {
    mocks.loanInstallmentsSelect.mockImplementationOnce(() => {
      throw new Error('relation does not exist')
    })
    mocks.rpc.mockResolvedValueOnce({ error: { message: 'rpc missing' } })

    const response = await POST(new Request('http://localhost/api/admin/create-installments'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('Table does not exist. Please create the loan_installments table first')
    expect(payload.requiresManualSetup).toBe(true)
    expect(payload.sql).toContain('CREATE TABLE IF NOT EXISTS public.loan_installments')
  })

  it('returns semantic installment creation summary on success', async () => {
    const response = await POST(new Request('http://localhost/api/admin/create-installments'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      createdInstallmentCount: 2,
      skippedTransactionCount: 0,
      erroredTransactionCount: 0,
      totalTransactions: 1,
    })
  })
})
