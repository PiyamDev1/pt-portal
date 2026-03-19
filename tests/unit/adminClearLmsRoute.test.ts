import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const verifyAdminAccess = vi.fn()
  const unauthorizedResponse = vi.fn((message: string, status = 401) =>
    Response.json({ error: message }, { status }),
  )

  const neq = vi.fn()
  const deleteFn = vi.fn(() => ({ neq }))
  const from = vi.fn(() => ({ delete: deleteFn }))
  const createClient = vi.fn(() => ({ from }))

  return {
    verifyAdminAccess,
    unauthorizedResponse,
    neq,
    deleteFn,
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

import { POST } from '@/app/api/admin/clear-lms/route'

describe('POST /api/admin/clear-lms', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    mocks.verifyAdminAccess.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
    })

    let call = 0
    mocks.neq.mockImplementation(async () => {
      call += 1
      if (call === 1) return { error: null, count: 3 }
      if (call === 2) return { error: null, count: 5 }
      if (call === 3) return { error: null, count: 2 }
      return { error: null, count: 4 }
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

    const response = await POST(new Request('http://localhost/api/admin/clear-lms'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
    expect(mocks.createClient).not.toHaveBeenCalled()
  })

  it('returns 500 when supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await POST(new Request('http://localhost/api/admin/clear-lms'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
  })

  it('returns semantic deleted counts when cleanup succeeds', async () => {
    const response = await POST(new Request('http://localhost/api/admin/clear-lms'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      deleted: {
        installments: 3,
        transactions: 5,
        loans: 2,
        customers: 4,
      },
    })
  })
})
