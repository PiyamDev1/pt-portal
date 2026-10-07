import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const from = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return { getUser, from, getRouteSupabaseClient }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/packageAudit', () => ({ recordPackageAuditEvent: vi.fn() }))
vi.mock('@/lib/packagePaymentsServer', () => ({ syncPackagePaymentFinancials: vi.fn() }))

import { POST } from '@/app/api/travel-packages/[id]/payments/route'
import { PATCH } from '@/app/api/travel-packages/[id]/payments/[paymentId]/route'

const params = { params: Promise.resolve({ id: 'package-1' }) }

describe('travel package payment creation request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
  })

  it('requires an authenticated agent before parsing a payment request', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await POST(
      new Request('http://localhost/api/travel-packages/package-1/payments', {
        method: 'POST',
      }) as never,
      params,
    )

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed', '{'],
    ['empty', undefined],
  ])('rejects a %s request before financial reads or writes', async (_kind, body) => {
    const response = await POST(
      new Request('http://localhost/api/travel-packages/package-1/payments', {
        method: 'POST',
        ...(body === undefined ? {} : { body }),
      }) as never,
      params,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

describe('travel package payment update request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
  })

  it.each([
    ['malformed', '{'],
    ['empty', undefined],
  ])('rejects a %s update before reading or writing payment data', async (_kind, body) => {
    const response = await PATCH(
      new Request('http://localhost/api/travel-packages/package-1/payments/payment-1', {
        method: 'PATCH',
        ...(body === undefined ? {} : { body }),
      }) as never,
      { params: Promise.resolve({ id: 'package-1', paymentId: 'payment-1' }) },
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
