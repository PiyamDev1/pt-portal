import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const upsert = vi.fn()
  const from = vi.fn(() => ({ upsert }))
  const createClient = vi.fn(() => ({ from }))

  return {
    upsert,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { GET, POST } from '@/app/api/admin/seed-countries/route'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { enforceRateLimit } from '@/lib/security/rateLimit'

describe('/api/admin/seed-countries route', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    vi.mocked(requireStaffSession).mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      employee: {
        id: 'admin-1',
        email: 'admin@example.com',
        fullName: 'Admin User',
        role: 'Admin',
        departments: [],
      },
    })
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    })

    mocks.upsert.mockResolvedValue({ error: null })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns unauthorized response when admin verification fails', async () => {
    vi.mocked(requireStaffSession).mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }) as never,
    })

    const response = await POST(new Request('http://localhost/api/admin/seed-countries'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('rejects unexpected payload fields before using the service client', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/seed-countries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await POST(new Request('http://localhost/api/admin/seed-countries'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns semantic seeded-country count on success', async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { message: 'duplicate key' } })

    const response = await POST(new Request('http://localhost/api/admin/seed-countries'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.seededCountryCount).toBeGreaterThan(0)
    expect(payload.seededCountryCount).toBe(32)
  })

  it('returns health metadata without legacy ok wrapper', async () => {
    const response = await GET()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      route: 'seed-countries',
      note: 'Use POST with proper authentication',
    })
  })
})
