import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const neq = vi.fn()
  const deleteFn = vi.fn(() => ({ neq }))
  const from = vi.fn(() => ({ delete: deleteFn }))
  const createClient = vi.fn(() => ({ from }))

  return { neq, deleteFn, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/wipe-installments/route'

describe('POST /api/admin/wipe-installments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.neq.mockResolvedValue({ error: null, count: 9 })
  })

  it('returns semantic success payload when wipe succeeds', async () => {
    const response = await POST(new Request('http://localhost/api/admin/wipe-installments'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ deletedInstallmentCount: 9 })
    expect(mocks.from).toHaveBeenCalledWith('loan_installments')
  })

  it('returns 500 error payload when supabase delete fails', async () => {
    mocks.neq.mockResolvedValue({ error: { message: 'delete failed' }, count: null })

    const response = await POST(new Request('http://localhost/api/admin/wipe-installments'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'delete failed' })
  })

  it('returns fallback 500 payload for unexpected errors', async () => {
    mocks.from.mockImplementationOnce(() => {
      throw new Error('boom')
    })

    const response = await POST(new Request('http://localhost/api/admin/wipe-installments'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'boom' })
  })
})
