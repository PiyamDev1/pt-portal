import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  return { from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { GET } from '@/app/api/lms/payment-methods/route'

describe('/api/lms/payment-methods route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  it('returns empty methods when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const request = new Request('http://localhost/api/lms/payment-methods')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ methods: [] })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns empty methods when query returns an error', async () => {
    const select = vi.fn(async () => ({ data: null, error: { message: 'query failed' } }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_payment_methods') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return { select }
    })

    const request = new Request('http://localhost/api/lms/payment-methods')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ methods: [] })
  })

  it('returns methods when query succeeds', async () => {
    const select = vi.fn(async () => ({
      data: [
        { id: 'pm-1', name: 'Cash' },
        { id: 'pm-2', name: 'Bank Transfer' },
      ],
      error: null,
    }))

    mocks.from.mockImplementation(() => ({ select }))

    const request = new Request('http://localhost/api/lms/payment-methods')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      methods: [
        { id: 'pm-1', name: 'Cash' },
        { id: 'pm-2', name: 'Bank Transfer' },
      ],
    })
  })

  it('returns empty methods when an exception is thrown', async () => {
    mocks.createClient.mockImplementation(() => {
      throw new Error('boom')
    })

    const request = new Request('http://localhost/api/lms/payment-methods')
    const response = await GET(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ methods: [] })
  })

  afterAll(() => {
    process.env = originalEnv
  })
})
