import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const neq = vi.fn()
  const deleteFn = vi.fn(() => ({ neq }))
  const from = vi.fn(() => ({ delete: deleteFn }))
  const rpc = vi.fn()
  const createClient = vi.fn(() => ({ from, rpc }))

  return { neq, deleteFn, from, rpc, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsAdmin: vi.fn(async () => ({
    authorized: true,
    user: { id: 'admin-1', email: 'admin@example.com' },
    employee: { id: 'admin-1' },
  })),
  verifyLmsDestructiveAction: vi.fn(async () => null),
}))

import { POST } from '@/app/api/admin/clear-lms-data/route'

describe('POST /api/admin/clear-lms-data', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.neq.mockResolvedValue({ error: null })
    mocks.rpc.mockResolvedValue({ data: {}, error: null })
  })

  it('returns semantic success payload when all tables are cleared', async () => {
    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      clearedTables: ['loan_installments', 'loan_transactions', 'loans', 'loan_customers'],
      clearedTableCount: 4,
    })
    expect(mocks.rpc).toHaveBeenCalledWith('lms_clear_all_data')
  })

  it('returns 500 with specific table failure', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'fk violation' } })

    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'fk violation' })
  })

  it('returns fallback 500 for thrown errors', async () => {
    mocks.createClient.mockImplementationOnce(() => {
      throw new Error('unexpected')
    })

    const response = await POST(new Request('http://localhost/api/admin/clear-lms-data'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'unexpected' })
  })
})
