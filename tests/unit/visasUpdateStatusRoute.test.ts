import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  const createClient = vi.fn(() => ({ from }))

  return { eq, update, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/visas/update-status/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/visas/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/visas/update-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ update: mocks.update })
    mocks.update.mockReturnValue({ eq: mocks.eq })
  })

  it('returns 200 when update succeeds', async () => {
    mocks.eq.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ id: 'visa-1', status: 'Approved' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ updatedVisaId: 'visa-1', status: 'Approved' })
  })

  it('returns 500 when Supabase update returns an error', async () => {
    mocks.eq.mockResolvedValue({ error: { message: 'update failed' } })

    const res = await POST(makeRequest({ id: 'visa-1', status: 'Rejected' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/update failed/i)
  })

  it('returns 500 when request JSON is invalid', async () => {
    const req = new Request('http://localhost/api/visas/update-status', {
      method: 'POST',
      body: '{invalid json',
    })

    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})
