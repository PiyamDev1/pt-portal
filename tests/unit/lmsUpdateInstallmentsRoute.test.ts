import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  requireLmsStaff: vi.fn(),
  enforceRateLimit: vi.fn(),
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/lms/apiAuth', () => ({
  requireLmsStaff: mocks.requireLmsStaff,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  getClientIp: vi.fn(() => '127.0.0.1'),
  enforceRateLimit: mocks.enforceRateLimit,
}))

import { POST } from '@/app/api/lms/update-installments/route'

const makeRequest = () =>
  new Request('http://localhost/api/lms/update-installments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installments: [
        { id: 'd7e5aa5a-e0a2-4f65-9af2-aeb75cd2c136', due_date: '2026-09-01', amount: 250 },
        { id: '028c5792-f897-44ae-9a9a-d79b5bf84acf', due_date: '2026-10-01', amount: 250 },
      ],
    }),
  })

describe('POST /api/lms/update-installments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLmsStaff.mockResolvedValue({
      authorized: true,
      user: { id: 'auth-user' },
      employee: { id: 'employee-server' },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 29,
      retryAfterSeconds: 0,
    })
  })

  it('sends the complete batch to one atomic RPC', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        updatedInstallmentIds: [
          'd7e5aa5a-e0a2-4f65-9af2-aeb75cd2c136',
          '028c5792-f897-44ae-9a9a-d79b5bf84acf',
        ],
        updatedCount: 2,
      },
      error: null,
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      updatedInstallmentIds: [
        'd7e5aa5a-e0a2-4f65-9af2-aeb75cd2c136',
        '028c5792-f897-44ae-9a9a-d79b5bf84acf',
      ],
      updatedCount: 2,
    })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('lms_update_installments', {
      p_installments: [
        { id: 'd7e5aa5a-e0a2-4f65-9af2-aeb75cd2c136', due_date: '2026-09-01', amount: 250 },
        { id: '028c5792-f897-44ae-9a9a-d79b5bf84acf', due_date: '2026-10-01', amount: 250 },
      ],
    })
  })

  it('maps a missing installment to 404 without a partial route-level loop', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0002', message: 'Installment not found' },
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(404)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
