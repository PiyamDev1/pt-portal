import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rpc = vi.fn()
  const createClient = vi.fn(() => ({ rpc }))

  return { rpc, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsMaintenance: vi.fn(async () => ({ authorized: true, employee: { id: 'admin-1' } })),
}))

import { POST } from '@/app/api/admin/create-installments-table/route'

describe('POST /api/admin/create-installments-table', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    mocks.rpc.mockResolvedValue({
      data: {
        ready: true,
        version: 20260812,
        details: { capabilities: ['atomic-ledger', 'idempotency', 'global-pagination'] },
      },
      error: null,
    })
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 500 when supabase env vars are missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = ''
    process.env.SUPABASE_SERVICE_ROLE_KEY = ''

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'Supabase not configured' })
  })

  it('returns 503 and migration guidance when the LMS schema is not ready', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist' } })

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.error).toBe('LMS schema is not ready. Apply the latest database migrations.')
    expect(payload.migration).toBe('scripts/migrations/20260812_secure_atomic_lms_operations.sql')
    expect(payload.requiredVersion).toBe(20260812)
    expect(payload.currentVersion).toBeNull()
  })

  it('returns semantic table-ready payload when table exists', async () => {
    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      tableReady: true,
      tableExists: true,
      schemaVersion: 20260812,
      capabilities: ['atomic-ledger', 'idempotency', 'global-pagination'],
    })
  })

  it('rejects an installed but outdated LMS schema', async () => {
    mocks.rpc.mockResolvedValue({ data: { ready: false, version: 20260811 }, error: null })

    const response = await POST()
    const payload = await response.json()

    expect(response.status).toBe(503)
    expect(payload.currentVersion).toBe(20260811)
    expect(payload.requiredVersion).toBe(20260812)
  })
})
