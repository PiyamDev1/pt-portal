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

import { GET } from '@/app/api/nadra/status-history/route'

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/nadra/status-history')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe('GET /api/nadra/status-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ eq: mocks.eq })
    mocks.eq.mockReturnValue({ order: mocks.order })
  })

  it('returns 400 when nadraId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing nadra id/i)
  })

  it('returns 500 when supabase query fails', async () => {
    mocks.order.mockResolvedValue({ data: null, error: { message: 'db failed' } })
    const res = await GET(makeRequest({ nadraId: 'n-1' }))
    expect(res.status).toBe(500)
  })

  it('maps history rows for frontend response', async () => {
    mocks.order.mockResolvedValue({
      data: [
        {
          id: 'h-1',
          entry_type: 'status',
          new_status: 'Completed',
          complaint_number: null,
          details: 'done',
          changed_at: '2025-01-01T00:00:00Z',
          employees: { full_name: 'Admin User' },
        },
      ],
      error: null,
    })

    const res = await GET(makeRequest({ nadraId: 'n-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.history).toHaveLength(1)
    expect(body.history[0]).toEqual({
      id: 'h-1',
      entryType: 'status',
      status: 'Completed',
      complaintNumber: null,
      details: 'done',
      changed_by: 'Admin User',
      date: '2025-01-01T00:00:00Z',
    })
  })
})
