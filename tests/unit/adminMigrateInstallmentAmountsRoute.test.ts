import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const order = vi.fn()
  const select = vi.fn(() => ({ order }))
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select, update }))
  const createClient = vi.fn(() => ({ from }))

  return { order, select, eq, update, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/admin/migrate-installment-amounts/route'

describe('POST /api/admin/migrate-installment-amounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.eq.mockResolvedValue({ error: null })
    mocks.order.mockResolvedValue({
      data: [
        { id: 'i-1', status: 'paid', amount: 100, amount_paid: 40 },
        { id: 'i-2', status: 'skipped', amount: 20, amount_paid: 0 },
        { id: 'i-3', status: 'pending', amount: 30, amount_paid: 0 },
      ],
      error: null,
    })
  })

  it('returns semantic migration summary payload', async () => {
    const response = await POST(new Request('http://localhost/api/admin/migrate-installment-amounts'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      totalInstallments: 3,
      updatedPaidCount: 1,
      updatedSkippedCount: 1,
      unchangedCount: 1,
    })
    expect(mocks.update).toHaveBeenNthCalledWith(1, { amount: 40 })
    expect(mocks.update).toHaveBeenNthCalledWith(2, { amount: 0 })
  })

  it('returns 500 when fetching installments fails', async () => {
    mocks.order.mockResolvedValueOnce({ data: null, error: { message: 'fetch failed' } })

    const response = await POST(new Request('http://localhost/api/admin/migrate-installment-amounts'))
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload).toEqual({ error: 'fetch failed' })
  })
})
