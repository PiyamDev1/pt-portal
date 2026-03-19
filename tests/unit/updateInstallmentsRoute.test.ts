import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const createClient = vi.fn(() => ({ from }))
  return { from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

import { POST } from '@/app/api/lms/update-installments/route'

describe('/api/lms/update-installments route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when installments payload is invalid', async () => {
    const request = new Request('http://localhost/api/lms/update-installments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ installments: null }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Invalid installments data' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('updates valid installments and skips invalid entries', async () => {
    const eq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq }))

    mocks.from.mockImplementation((table: string) => {
      if (table !== 'loan_installments') throw new Error('Unexpected table')
      return { update }
    })

    const request = new Request('http://localhost/api/lms/update-installments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installments: [
          { id: 'i-1', due_date: '2026-04-01', amount: '100.50' },
          { id: 'i-2', due_date: '2026-05-01', amount: 125 },
          { id: '', due_date: '2026-06-01', amount: 80 },
        ],
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.updatedInstallmentIds).toEqual(['i-1', 'i-2'])
    expect(payload.updatedCount).toBe(2)
    expect(update).toHaveBeenCalledTimes(2)
    expect(eq).toHaveBeenNthCalledWith(1, 'id', 'i-1')
    expect(eq).toHaveBeenNthCalledWith(2, 'id', 'i-2')
  })

  it('returns 500 when a Supabase update fails', async () => {
    const eq = vi.fn(async () => ({ error: { message: 'db failed' } }))
    const update = vi.fn(() => ({ eq }))

    mocks.from.mockImplementation(() => ({ update }))

    const request = new Request('http://localhost/api/lms/update-installments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installments: [{ id: 'i-1', due_date: '2026-04-01', amount: '100.50' }],
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(500)
    expect(payload.error).toContain('db failed')
  })
})
