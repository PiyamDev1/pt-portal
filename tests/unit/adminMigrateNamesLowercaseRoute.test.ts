import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const select = vi.fn()
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select, update }))
  const createClient = vi.fn(() => ({ from }))

  return {
    select,
    eq,
    update,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/migrate-names-lowercase/route'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { enforceRateLimit } from '@/lib/security/rateLimit'

describe('POST /api/admin/migrate-names-lowercase', () => {
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
      remaining: 2,
      retryAfterSeconds: 0,
    })

    mocks.eq.mockResolvedValue({ error: null })
    mocks.select.mockResolvedValue({
      data: [
        { id: 'a1', first_name: 'Ali', last_name: 'KHAN' },
        { id: 'a2', first_name: 'sara', last_name: 'ali' },
      ],
      error: null,
    })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns unauthorized response when admin verification fails', async () => {
    vi.mocked(requireStaffSession).mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }) as never,
    })

    const response = await POST(new Request('http://localhost/api/admin/migrate-names-lowercase'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('passes through a shared rate-limit response', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }) as never,
    })

    const response = await POST(
      new Request('http://localhost/api/admin/migrate-names-lowercase', { method: 'POST' }),
    )

    expect(response.status).toBe(429)
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 500 when Supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await POST(new Request('http://localhost/api/admin/migrate-names-lowercase'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 500 with fetch failure detail', async () => {
    mocks.select.mockResolvedValueOnce({
      data: null,
      error: { message: 'db unavailable' },
    })

    const response = await POST(new Request('http://localhost/api/admin/migrate-names-lowercase'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Failed to fetch applicants: db unavailable' })
  })

  it('returns semantic migration summary payload', async () => {
    const response = await POST(new Request('http://localhost/api/admin/migrate-names-lowercase'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      updatedCount: 1,
      totalProcessed: 2,
      errors: null,
    })

    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update).toHaveBeenCalledWith({
      first_name: 'ali',
      last_name: 'khan',
    })
    expect(mocks.eq).toHaveBeenCalledWith('id', 'a1')
  })
})
