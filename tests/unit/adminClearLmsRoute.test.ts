import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireLmsAdmin = vi.fn()
  const verifyLmsDestructiveAction = vi.fn()

  const neq = vi.fn()
  const deleteFn = vi.fn(() => ({ neq }))
  const from = vi.fn(() => ({ delete: deleteFn }))
  const rpc = vi.fn()
  const createClient = vi.fn(() => ({ from, rpc }))

  return {
    requireLmsAdmin,
    verifyLmsDestructiveAction,
    neq,
    deleteFn,
    from,
    createClient,
    rpc,
  }
})
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsAdmin: mocks.requireLmsAdmin,
  verifyLmsDestructiveAction: mocks.verifyLmsDestructiveAction,
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
    mocks.requireLmsAdmin.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1' },
      employee: { id: 'admin-1' },
    })
    mocks.verifyLmsDestructiveAction.mockResolvedValue(null)

    mocks.rpc.mockResolvedValue({
      data: { installments: 3, transactions: 5, loans: 2, customers: 4 },
      error: null,
    })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns unauthorized response when admin verification fails', async () => {
    mocks.requireLmsAdmin.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
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
