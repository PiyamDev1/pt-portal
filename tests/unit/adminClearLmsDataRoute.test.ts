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

import { POST } from '@/app/api/admin/clear-lms-data/route'

describe('POST /api/admin/clear-lms-data', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    mocks.requireLmsAdmin.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      employee: { id: 'admin-1' },
    })
    mocks.verifyLmsDestructiveAction.mockResolvedValue(null)
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.rpc.mockResolvedValue({ data: {}, error: null })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns the legacy table-list success payload and route-specific rate limit', async () => {
    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      clearedTables: ['loan_installments', 'loan_transactions', 'loans', 'loan_customers'],
      clearedTableCount: 4,
    })
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      expect.objectContaining({ scope: 'admin.clear-lms-data' }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('lms_clear_all_data')
  })

  it('returns 500 with the database failure message', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'fk violation' } })

    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'fk violation' })
  })

  it('returns a consistent fallback 500 for thrown service-client errors', async () => {
    mocks.getServiceSupabaseClient.mockImplementationOnce(() => {
      throw new Error('unexpected')
    })

    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'unexpected' })
  })
})
