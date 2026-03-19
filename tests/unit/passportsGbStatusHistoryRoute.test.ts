import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const order = vi.fn()
  const eq = vi.fn(() => ({ order }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const createClient = vi.fn(() => ({ from }))
  return { order, eq, select, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { GET } from '@/app/api/passports/gb/status-history/route'

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/passports/gb/status-history')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe('GET /api/passports/gb/status-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ eq: mocks.eq })
    mocks.eq.mockReturnValue({ order: mocks.order })
  })

  it('returns empty history when passportId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.history).toEqual([])
  })

  it('returns history rows on success', async () => {
    mocks.order.mockResolvedValue({
      data: [{ id: 'h-1', new_status: 'Submitted', employees: { full_name: 'User A' } }],
      error: null,
    })

    const res = await GET(makeRequest({ passportId: 'gb-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.history).toHaveLength(1)
    expect(body.history[0].id).toBe('h-1')
  })

  it('returns 500 when query fails', async () => {
    mocks.order.mockResolvedValue({ data: null, error: { message: 'db failed' } })
    const res = await GET(makeRequest({ passportId: 'gb-1' }))
    expect(res.status).toBe(500)
  })
})
