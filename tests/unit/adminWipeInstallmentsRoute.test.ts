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
  requireLmsMaintenance: vi.fn(async () => ({
    authorized: true,
    user: { id: 'admin-1', email: 'admin@example.com' },
    employee: { id: 'admin-1' },
  })),
  verifyLmsDestructiveAction: vi.fn(async () => null),
}))

import { POST } from '@/app/api/admin/wipe-installments/route'

describe('POST /api/admin/wipe-installments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.neq.mockResolvedValue({ error: null, count: 9 })
    mocks.rpc.mockResolvedValue({ data: { deletedInstallmentCount: 9 }, error: null })
  })

  it('returns semantic success payload when wipe succeeds', async () => {
    const response = await POST(new Request('http://localhost/api/admin/wipe-installments'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ deletedInstallmentCount: 9 })
    expect(mocks.rpc).toHaveBeenCalledWith('lms_wipe_installments')
  })

  it('returns 500 error payload when supabase delete fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'delete failed' } })

    const response = await POST(new Request('http://localhost/api/admin/wipe-installments'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'delete failed' })
  })

  it('returns fallback 500 payload for unexpected errors', async () => {
    mocks.createClient.mockImplementationOnce(() => {
      throw new Error('boom')
    })

    const response = await POST(new Request('http://localhost/api/admin/wipe-installments'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'boom' })
  })
})
