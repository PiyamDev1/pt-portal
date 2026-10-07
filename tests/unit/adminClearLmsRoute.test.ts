import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rpc = vi.fn()
  const getServiceSupabaseClient = vi.fn(() => ({ rpc }))
  const requireLmsAdmin = vi.fn()
  const verifyLmsDestructiveAction = vi.fn()
  const enforceRateLimit = vi.fn()
  const getClientIp = vi.fn(() => '127.0.0.1')

  return {
    rpc,
    getServiceSupabaseClient,
    requireLmsAdmin,
    verifyLmsDestructiveAction,
    enforceRateLimit,
    getClientIp,
  }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsAdmin: mocks.requireLmsAdmin,
  verifyLmsDestructiveAction: mocks.verifyLmsDestructiveAction,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: mocks.getClientIp,
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
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.rpc.mockResolvedValue({
      data: { installments: 3, transactions: 5, loans: 2, customers: 4 },
      error: null,
    })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns unauthorized response without creating a service client', async () => {
    const denied = Response.json({ error: 'Forbidden' }, { status: 403 })
    mocks.requireLmsAdmin.mockResolvedValueOnce({ authorized: false, response: denied })

    const response = await POST(new Request('http://localhost/api/admin/clear-lms'))

    expect(response).toBe(denied)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
  })

  it('returns 500 when Supabase environment variables are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await POST(new Request('http://localhost/api/admin/clear-lms'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns semantic deleted counts and retains the legacy route scope', async () => {
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
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ scope: 'admin.clear-lms' }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('lms_clear_all_data')
  })

  it('does not run the clear RPC when fresh second-factor verification fails', async () => {
    const denied = Response.json({ error: 'Verification failed' }, { status: 403 })
    mocks.verifyLmsDestructiveAction.mockResolvedValueOnce(denied)

    const response = await POST(new Request('http://localhost/api/admin/clear-lms'))

    expect(response).toBe(denied)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns the database error when the clear RPC fails', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'RPC failed' } })

    const response = await POST(new Request('http://localhost/api/admin/clear-lms'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'RPC failed' })
  })
})
