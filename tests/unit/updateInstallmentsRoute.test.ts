import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rpc = vi.fn()
  return { rpc }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsStaff: vi.fn(async () => ({
    authorized: true,
    user: { id: 'user-1', email: 'staff@example.com' },
    employee: {
      id: 'emp-1',
      email: 'staff@example.com',
      fullName: 'Test Staff',
      role: 'Master Admin',
      departments: [],
    },
  })),
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
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('updates every validated installment entry in one atomic call', async () => {
    mocks.rpc.mockResolvedValue({
      data: { updatedInstallmentIds: ['i-1', 'i-2'], updatedCount: 2 },
      error: null,
    })

    const request = new Request('http://localhost/api/lms/update-installments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        installments: [
          { id: 'i-1', due_date: '2026-04-01', amount: '100.50' },
          { id: 'i-2', due_date: '2026-05-01', amount: 125 },
        ],
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.updatedInstallmentIds).toEqual(['i-1', 'i-2'])
    expect(payload.updatedCount).toBe(2)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('lms_update_installments', {
      p_installments: [
        { id: 'i-1', due_date: '2026-04-01', amount: 100.5 },
        { id: 'i-2', due_date: '2026-05-01', amount: 125 },
      ],
    })
  })

  it('returns 500 when the atomic Supabase call fails', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'db failed' },
    })

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
