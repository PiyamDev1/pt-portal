import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const ROOT_TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'
const TRANSACTION_ID = '82000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const state: {
    capability: { data: unknown; error: unknown }
    payment: { data: unknown; error: unknown }
  } = {
    capability: { data: null, error: null },
    payment: { data: null, error: null },
  }
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'ticketing_schema_status') return state.capability
    if (functionName === 'ticketing_mark_service_transaction_paid') return state.payment
    throw new Error(`Unexpected RPC: ${functionName}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ rpc }))
  return { requireTicketingAccess, enforceRateLimit, state, rpc, getServiceSupabaseClient }
})

vi.mock('@/lib/ticketing/apiAuth', () => ({
  requireTicketingAccess: mocks.requireTicketingAccess,
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '127.0.0.1',
}))

import { PATCH } from '@/app/api/ticketing/bookings/[bookingId]/transactions/[transactionId]/route'

function validPayment() {
  return {
    expectedBookingVersion: 5,
    expectedTransactionVersion: 2,
    paidAt: '2026-08-24',
  }
}

function request(body: unknown, idempotencyKey: string | null = 'service-payment-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idempotencyKey !== null) headers['Idempotency-Key'] = idempotencyKey
  return new NextRequest(
    `http://localhost/api/ticketing/bookings/${BOOKING_ID}/transactions/${TRANSACTION_ID}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify(body),
    },
  )
}

function context(bookingId = BOOKING_ID, transactionId = TRANSACTION_ID) {
  return { params: Promise.resolve({ bookingId, transactionId }) }
}

function paymentResult(options: { changed?: boolean; idempotentReplay?: boolean } = {}) {
  const changed = options.changed !== false
  return {
    booking: { id: BOOKING_ID, version: changed ? 6 : 5 },
    transaction: {
      id: TRANSACTION_ID,
      version: changed ? 3 : 2,
      parentTransactionId: ROOT_TRANSACTION_ID,
      serviceType: 'DC',
      operationalStatus: 'issued',
      paymentStatus: 'paid',
      bookingDate: '2026-08-23',
      issuedOn: '2026-08-23',
      paidAt: '2026-08-24T00:00:00.000Z',
      paidOn: '2026-08-24',
      currency: 'GBP',
      passengerTicketCount: 2,
      supplierCost: 20,
      salePrice: 60,
    },
    sourceEvent: { eventType: 'ticket_paid' },
    changed,
    idempotentReplay: options.idempotentReplay === true,
  }
}

describe('PATCH /api/ticketing/bookings/[bookingId]/transactions/[transactionId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'team',
      user: { id: ACTOR_ID, email: 'manager@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'manager@example.test',
        fullName: 'Ticketing Manager',
        role: 'Manager',
        departments: [],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 0,
    })
    mocks.state.capability = {
      data: { ready: true, version: 2026082304, requiredVersion: 2026082304 },
      error: null,
    }
    mocks.state.payment = { data: paymentResult(), error: null }
  })

  it('authenticates before rate limiting or creating a service-role client', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await PATCH(request(validPayment()), context())

    expect(response.status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('maps either invalid UUID path to the same private 404', async () => {
    const invalidBooking = await PATCH(request(validPayment()), context('not-a-uuid'))
    const invalidTransaction = await PATCH(
      request(validPayment()),
      context(BOOKING_ID, 'not-a-uuid'),
    )

    expect(invalidBooking.status).toBe(404)
    expect(invalidTransaction.status).toBe(404)
    expect(await invalidBooking.json()).toEqual({ error: 'Ticket service transaction not found.' })
    expect(await invalidTransaction.json()).toEqual({
      error: 'Ticket service transaction not found.',
    })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects unknown payment/identity fields and a missing retry key before the RPC', async () => {
    expect(
      (
        await PATCH(
          request({ ...validPayment(), paymentStatus: 'paid', ownerEmployeeId: 'other-agent' }),
          context(),
        )
      ).status,
    ).toBe(400)
    expect((await PATCH(request(validPayment(), null), context())).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('enforces the mutation rate limit and 8 KiB body bound before service-role writes', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    })
    expect((await PATCH(request(validPayment()), context())).status).toBe(429)

    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: true,
      remaining: 58,
      retryAfterSeconds: 0,
    })
    const oversized = await PATCH(
      request({ ...validPayment(), padding: 'x'.repeat(10 * 1024) }),
      context(),
    )

    expect(oversized.status).toBe(400)
    expect(await oversized.json()).toEqual({ error: 'Request body is too large' })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('passes only verified path identity and strict payment facts to one RPC', async () => {
    const response = await PATCH(request(validPayment(), 'mark-paid-1'), context())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.mark-service-transaction-paid',
        limit: 60,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_mark_service_transaction_paid', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_transaction_id: TRANSACTION_ID,
      p_idempotency_key: 'mark-paid-1',
      p_payment: validPayment(),
    })
    expect(body).toEqual({
      bookingId: BOOKING_ID,
      bookingVersion: 6,
      transactionId: TRANSACTION_ID,
      transactionVersion: 3,
      serviceType: 'DC',
      operationalStatus: 'issued',
      paymentStatus: 'paid',
      paidAt: '2026-08-24',
      passengerCount: 2,
      changed: true,
      idempotentReplay: false,
    })
    expect(JSON.stringify(body)).not.toMatch(
      /supplier|sale|commission|profit|margin|earnings|source/i,
    )
  })

  it('accepts a safe already-paid no-op and a lost-response replay', async () => {
    mocks.state.payment = { data: paymentResult({ changed: false }), error: null }
    const noOp = await PATCH(request(validPayment(), 'paid-noop-1'), context())
    expect(await noOp.json()).toMatchObject({
      bookingVersion: 5,
      transactionVersion: 2,
      changed: false,
      idempotentReplay: false,
    })

    mocks.state.payment = {
      data: paymentResult({ changed: true, idempotentReplay: true }),
      error: null,
    }
    const replay = await PATCH(request(validPayment(), 'paid-replay-1'), context())
    expect(await replay.json()).toMatchObject({ changed: true, idempotentReplay: true })
  })

  it('fails closed when the DC/R-ER capability is unavailable', async () => {
    mocks.state.capability = {
      data: { ready: true, version: 2026082303, requiredVersion: 2026082303 },
      error: null,
    }

    const response = await PATCH(request(validPayment()), context())

    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_mark_service_transaction_paid',
      expect.anything(),
    )
  })

  it.each([
    {
      name: 'version conflict',
      error: {
        code: '40001',
        hint: 'TICKETING_VERSION_CONFLICT',
        details: JSON.stringify({ bookingVersion: 8, transactionVersion: 11 }),
      },
      status: 409,
      code: 'VERSION_CONFLICT',
      currentVersions: { bookingVersion: 8, transactionVersion: 11 },
    },
    {
      name: 'idempotency conflict',
      error: { code: '22023', hint: 'TICKETING_IDEMPOTENCY_CONFLICT' },
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      currentVersions: undefined,
    },
    {
      name: 'correction required',
      error: { code: '55000', hint: 'TICKETING_CORRECTION_REQUIRED' },
      status: 409,
      code: 'CORRECTION_REQUIRED',
      currentVersions: undefined,
    },
    {
      name: 'hidden owner or transaction mismatch',
      error: { code: 'P0002', hint: 'TICKETING_RECORD_NOT_FOUND' },
      status: 404,
      code: undefined,
      currentVersions: undefined,
    },
  ])(
    'maps $name without leaking database details',
    async ({ error, status, code, currentVersions }) => {
      mocks.state.payment = { data: null, error }

      const response = await PATCH(request(validPayment()), context())
      const body = await response.json()

      expect(response.status).toBe(status)
      expect(body.code).toBe(code)
      expect(body.currentVersions).toEqual(currentVersions)
      expect(JSON.stringify(body)).not.toContain('TICKETING_')
    },
  )

  it('rejects mismatched IDs, service state, or unsafe version semantics in the RPC result', async () => {
    mocks.state.payment = {
      data: {
        ...paymentResult(),
        transaction: { ...paymentResult().transaction, serviceType: 'TK' },
      },
      error: null,
    }
    expect((await PATCH(request(validPayment()), context())).status).toBe(500)

    mocks.state.payment = {
      data: {
        ...paymentResult({ changed: false }),
        booking: { id: BOOKING_ID, version: 6 },
      },
      error: null,
    }
    const unsafeNoOp = await PATCH(request(validPayment(), 'unsafe-noop-1'), context())

    expect(unsafeNoOp.status).toBe(500)
    expect(await unsafeNoOp.json()).toEqual({
      error: 'Ticketing returned an invalid payment result.',
    })
  })

  it('fails closed on malformed replay, GBP, timestamp, or business-date facts', async () => {
    const malformedResults = [
      { ...paymentResult(), idempotentReplay: undefined },
      {
        ...paymentResult(),
        transaction: { ...paymentResult().transaction, currency: 'EUR' },
      },
      {
        ...paymentResult(),
        transaction: { ...paymentResult().transaction, paidAt: 'not-a-timestamptz' },
      },
      {
        ...paymentResult(),
        transaction: { ...paymentResult().transaction, bookingDate: '2026-02-30' },
      },
      {
        ...paymentResult(),
        transaction: { ...paymentResult().transaction, issuedOn: '2026-08-22' },
      },
    ]

    for (const [index, data] of malformedResults.entries()) {
      mocks.state.payment = { data, error: null }
      const response = await PATCH(
        request(validPayment(), `malformed-payment-result-${index}`),
        context(),
      )

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: 'Ticketing returned an invalid payment result.',
      })
    }
  })

  it('requires the persisted paid business date to equal the requested paidAt date', async () => {
    mocks.state.payment = {
      data: {
        ...paymentResult(),
        transaction: { ...paymentResult().transaction, paidOn: '2026-08-25' },
      },
      error: null,
    }

    const response = await PATCH(request(validPayment(), 'payment-date-drift'), context())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Ticketing returned an invalid payment result.',
    })
  })

  it('does not expose an unmapped database validation message', async () => {
    mocks.state.payment = {
      data: null,
      error: { code: '23514', message: 'internal relation and constraint details' },
    }

    const response = await PATCH(request(validPayment()), context())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid service payment.' })
  })
})
