import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const verifyAdminAccess = vi.fn()
  const unauthorizedResponse = vi.fn((message: string, status = 401) =>
    Response.json({ error: message }, { status }),
  )

  const select = vi.fn()
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select, update }))
  const createClient = vi.fn(() => ({ from }))

  return {
    verifyAdminAccess,
    unauthorizedResponse,
    select,
    eq,
    update,
    from,
    createClient,
  }
})

vi.mock('@/lib/adminAuth', () => ({
  verifyAdminAccess: mocks.verifyAdminAccess,
  unauthorizedResponse: mocks.unauthorizedResponse,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/migrate-names-lowercase/route'

describe('POST /api/admin/migrate-names-lowercase', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'

    mocks.verifyAdminAccess.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
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
    mocks.verifyAdminAccess.mockResolvedValueOnce({
      authorized: false,
      error: 'Forbidden',
      status: 403,
    })

    const response = await POST(new Request('http://localhost/api/admin/migrate-names-lowercase'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
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
