import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const rpc = vi.fn()
  return {
    requireTicketingAccess,
    enforceRateLimit,
    rpc,
    getServiceSupabaseClient: vi.fn(() => ({ rpc })),
  }
})

vi.mock('@/lib/ticketing/apiAuth', () => ({ requireTicketingAccess: mocks.requireTicketingAccess }))
vi.mock('@/lib/api/serviceSupabase', () => ({ getServiceSupabaseClient: mocks.getServiceSupabaseClient }))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '127.0.0.1',
}))

import { PATCH } from '@/app/api/ticketing/ledger/[bookingId]/payment-status/route'

function request(body: unknown, key: string | null = 'payment-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['Idempotency-Key'] = key
  return new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}/payment-status`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

const context = () => ({ params: Promise.resolve({ bookingId: BOOKING_ID }) })
const validPayment = () => ({
  expectedBookingVersion: 4,
  expectedTransactionVersion: 7,
  paymentStatus: 'part_paid',
  paidAt: null,
})

describe('PATCH /api/ticketing/ledger/[bookingId]/payment-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID },
      employee: { id: ACTOR_ID, role: 'Agent', departments: ['Ticketing'] },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.rpc.mockResolvedValue({
      data: {
        booking: { id: BOOKING_ID, version: 5 },
        transaction: { id: TRANSACTION_ID, version: 8, paymentStatus: 'part_paid', paidAt: null },
        changed: true,
        idempotentReplay: false,
      },
      error: null,
    })
  })

  it('does not create a service client before Ticketing authentication', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    expect((await PATCH(request(validPayment()), context())).status).toBe(401)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('accepts all three direct payment states but validates their paid date', async () => {
    expect((await PATCH(request(validPayment()), context())).status).toBe(200)
    expect(
      (
        await PATCH(
          request({ ...validPayment(), paymentStatus: 'paid', paidAt: null }, 'missing-date'),
          context(),
        )
      ).status,
    ).toBe(400)
    expect(
      (
        await PATCH(
          request({ ...validPayment(), paymentStatus: 'unpaid', paidAt: '2026-09-25' }, 'extra-date'),
          context(),
        )
      ).status,
    ).toBe(400)
  })

  it('sends only the signed-in actor, path booking and verified payment to the guarded RPC', async () => {
    const response = await PATCH(request(validPayment(), 'direct-payment-1'), context())
    expect(response.status).toBe(200)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.update-root-payment-status',
        limit: 90,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_update_root_payment_status', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_idempotency_key: 'direct-payment-1',
      p_payment: validPayment(),
    })
  })
})
