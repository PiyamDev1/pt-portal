import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rpc = vi.fn()
  const getServiceSupabaseClient = vi.fn(() => ({ rpc }))
  const requireLmsMaintenance = vi.fn()
  return { rpc, getServiceSupabaseClient, requireLmsMaintenance }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsMaintenance: mocks.requireLmsMaintenance,
}))

import { POST } from '@/app/api/admin/create-installments-table/route'

describe('POST /api/admin/create-installments-table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    mocks.requireLmsMaintenance.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      employee: { id: 'admin-1', fullName: 'Admin', role: 'Admin', departments: [] },
    })
  })

  it('reports schema readiness and its available capabilities', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        ready: true,
        version: 20260812,
        details: { capabilities: ['atomic_payment_posting'] },
      },
      error: null,
    })

    const response = await POST()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      tableReady: true,
      tableExists: true,
      schemaVersion: 20260812,
      capabilities: ['atomic_payment_posting'],
    })
    expect(mocks.rpc).toHaveBeenCalledWith('lms_schema_status')
  })

  it('reports a not-ready schema without applying migrations', async () => {
    mocks.rpc.mockResolvedValue({
      data: { ready: false, version: 20260811, details: { capabilities: [] } },
      error: null,
    })

    const response = await POST()

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: 'LMS schema is not ready. Apply the latest database migrations.',
      requiredVersion: 20260812,
      currentVersion: 20260811,
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
