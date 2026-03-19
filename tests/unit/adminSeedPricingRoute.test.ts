import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const insert = vi.fn()
  const select = vi.fn()
  const from = vi.fn(() => ({ insert, select }))
  const createClient = vi.fn(() => ({ from }))

  return {
    insert,
    select,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/seed-pricing/route'

describe('POST /api/admin/seed-pricing', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mocks.insert.mockResolvedValue({ error: null })

    const countQueue = [{ count: 30 }, { count: 24 }, { count: 27 }]
    mocks.select.mockImplementation(async () => countQueue.shift() ?? { count: 0 })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 401 when authorization header is missing', async () => {
    const request = new Request('http://localhost/api/admin/seed-pricing', { method: 'POST' })

    const response = await POST(request as any)
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const request = new Request('http://localhost/api/admin/seed-pricing', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
    })

    const response = await POST(request as any)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns semantic pricing counts on success', async () => {
    const request = new Request('http://localhost/api/admin/seed-pricing', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
    })

    const response = await POST(request as any)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      nadraCount: 30,
      pkCount: 24,
      gbCount: 27,
    })
  })

  it('returns 500 when insert throws', async () => {
    mocks.insert.mockRejectedValueOnce(new Error('insert failed'))

    const request = new Request('http://localhost/api/admin/seed-pricing', {
      method: 'POST',
      headers: { authorization: 'Bearer secret' },
    })

    const response = await POST(request as any)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'insert failed' })
  })
})
