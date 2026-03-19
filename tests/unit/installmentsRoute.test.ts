import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  const ensureInstallmentsTableExists = vi.fn(async () => undefined)
  return { from, createClient, ensureInstallmentsTableExists }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('@/lib/installmentsDb', () => ({
  ensureInstallmentsTableExists: mocks.ensureInstallmentsTableExists,
}))

import { GET } from '@/app/api/lms/installments/route'

describe('/api/lms/installments route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const request = new Request('http://localhost/api/lms/installments?transactionId=tx-1')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 400 when transactionId is missing', async () => {
    const request = new Request('http://localhost/api/lms/installments')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'transactionId is required' })
    expect(mocks.ensureInstallmentsTableExists).not.toHaveBeenCalled()
  })

  it('returns installments when query succeeds', async () => {
    const order = vi.fn(async () => ({
      data: [
        { id: 'inst-1', installment_number: 1 },
        { id: 'inst-2', installment_number: 2 },
      ],
      error: null,
    }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_installments') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return { select }
    })

    const request = new Request('http://localhost/api/lms/installments?transactionId=tx-123')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      installments: [
        { id: 'inst-1', installment_number: 1 },
        { id: 'inst-2', installment_number: 2 },
      ],
    })
    expect(mocks.ensureInstallmentsTableExists).toHaveBeenCalledTimes(1)
    expect(eq).toHaveBeenCalledWith('loan_transaction_id', 'tx-123')
    expect(order).toHaveBeenCalledWith('installment_number', { ascending: true })
  })

  it('returns empty installments when Supabase returns query error', async () => {
    const order = vi.fn(async () => ({
      data: null,
      error: { message: 'bad query' },
    }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))

    mocks.from.mockImplementation(() => ({ select }))

    const request = new Request('http://localhost/api/lms/installments?transactionId=tx-err')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ installments: [] })
  })

  afterAll(() => {
    process.env = originalEnv
  })
})
