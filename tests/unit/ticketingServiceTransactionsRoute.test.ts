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
    append: { data: unknown; error: unknown }
  } = {
    capability: { data: null, error: null },
    append: { data: null, error: null },
  }
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'ticketing_schema_status') return state.capability
    if (functionName === 'ticketing_append_service_transaction_allocated') return state.append
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

import { POST } from '@/app/api/ticketing/bookings/[bookingId]/transactions/route'

function validEntry() {
  return {
    expectedBookingVersion: 4,
    expectedRootTransactionVersion: 7,
    serviceType: 'DC' as const,
    bookingDate: '2026-08-23',
    issuedAt: '2026-08-23',
    paymentStatus: 'unpaid' as const,
    paidAt: null,
    currency: 'GBP' as const,
    selectedPassengerIds: [
      'a1000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000002',
    ],
    fares: [
      {
        passengerType: 'ADT' as const,
        quantity: 2,
        unitSupplierCost: 10,
        unitSalePrice: 30,
      },
    ],
  }
}

function request(body: unknown, idempotencyKey: string | null = 'append-service-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idempotencyKey !== null) headers['Idempotency-Key'] = idempotencyKey
  return new NextRequest(`http://localhost/api/ticketing/bookings/${BOOKING_ID}/transactions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function context(bookingId = BOOKING_ID) {
  return { params: Promise.resolve({ bookingId }) }
}

function rpcResult(idempotentReplay = false) {
  return {
    booking: { id: BOOKING_ID, version: 5 },
    rootTransaction: { id: ROOT_TRANSACTION_ID, version: 7, serviceType: 'TK' },
    transaction: {
      id: TRANSACTION_ID,
      version: 2,
      parentTransactionId: ROOT_TRANSACTION_ID,
      serviceType: 'DC',
      operationalStatus: 'issued',
      paymentStatus: 'unpaid',
      bookingDate: '2026-08-23',
      issuedAt: '2026-08-23T00:00:00.000Z',
      issuedOn: '2026-08-23',
      paidAt: null,
      paidOn: null,
      currency: 'GBP',
      passengerTicketCount: 2,
      supplierCost: 20,
      salePrice: 60,
    },
    packageMatch: { status: 'matched', scope: 'package' },
    sourceEvent: { eventType: 'ticket_date_changed' },
    idempotentReplay,
  }
}

describe('POST /api/ticketing/bookings/[bookingId]/transactions', () => {
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
      data: { ready: true, version: 2026082703, requiredVersion: 2026082703 },
      error: null,
    }
    mocks.state.append = { data: rpcResult(), error: null }
  })

  it('authenticates before rate limiting or creating a service-role client', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(request(validEntry()), context())

    expect(response.status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects invalid paths, caller identity fields, and missing retry keys before the RPC', async () => {
    expect((await POST(request(validEntry()), context('not-a-uuid'))).status).toBe(404)
    expect(
      (await POST(request({ ...validEntry(), ownerEmployeeId: 'other-agent' }), context())).status,
    ).toBe(400)
    expect((await POST(request(validEntry(), null), context())).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('enforces the mutation rate limit and 16 KiB body bound before service-role writes', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    })
    expect((await POST(request(validEntry()), context())).status).toBe(429)

    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: true,
      remaining: 58,
      retryAfterSeconds: 0,
    })
    const oversized = await POST(
      request({ ...validEntry(), padding: 'x'.repeat(20 * 1024) }),
      context(),
    )

    expect(oversized.status).toBe(400)
    expect(await oversized.json()).toEqual({ error: 'Request body is too large' })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('passes only the verified actor, path booking, retry key, and strict entry to the RPC', async () => {
    const response = await POST(request(validEntry(), 'dc-save-1'), context())
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.append-service-transaction',
        limit: 60,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_append_service_transaction_allocated', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_idempotency_key: 'dc-save-1',
      p_entry: validEntry(),
    })
    expect(body).toEqual({
      bookingId: BOOKING_ID,
      bookingVersion: 5,
      rootTransactionId: ROOT_TRANSACTION_ID,
      rootTransactionVersion: 7,
      transactionId: TRANSACTION_ID,
      transactionVersion: 2,
      serviceType: 'DC',
      operationalStatus: 'issued',
      paymentStatus: 'unpaid',
      passengerCount: 2,
      packageMatchStatus: 'matched',
      idempotentReplay: false,
    })
    expect(JSON.stringify(body)).not.toMatch(/supplier|sale|commission|profit|margin|earnings/i)
  })

  it('returns a replay as 200 without exposing the RPC financial/source payload', async () => {
    mocks.state.append = { data: rpcResult(true), error: null }

    const response = await POST(request(validEntry()), context())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.idempotentReplay).toBe(true)
    expect(body).not.toHaveProperty('sourceEvent')
    expect(body).not.toHaveProperty('fares')
  })

  it('accepts the same bounded route contract for an explicitly paid R-ER', async () => {
    const entry = {
      ...validEntry(),
      serviceType: 'R-ER' as const,
      paymentStatus: 'paid' as const,
      paidAt: '2026-08-23',
    }
    mocks.state.append = {
      data: {
        ...rpcResult(),
        transaction: {
          ...rpcResult().transaction,
          serviceType: 'R-ER',
          paymentStatus: 'paid',
          paidAt: '2026-08-23T00:00:00.000Z',
          paidOn: '2026-08-23',
        },
      },
      error: null,
    }

    const response = await POST(request(entry, 'rer-paid-1'), context())
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body).toMatchObject({ serviceType: 'R-ER', paymentStatus: 'paid' })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'ticketing_append_service_transaction_allocated',
      expect.objectContaining({ p_entry: entry }),
    )
  })

  it('fails closed when the DC/R-ER capability is unavailable', async () => {
    mocks.state.capability = {
      data: { ready: true, version: 2026082303, requiredVersion: 2026082303 },
      error: null,
    }

    const response = await POST(request(validEntry()), context())

    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_append_service_transaction_allocated',
      expect.anything(),
    )
  })

  it('accepts a singleton-array DC/R-ER mutation capability response', async () => {
    mocks.state.capability = {
      data: [{ ready: true, version: 2026082703, requiredVersion: 2026082703 }],
      error: null,
    }

    const response = await POST(request(validEntry()), context())

    expect(response.status).toBe(201)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'ticketing_append_service_transaction_allocated',
      expect.anything(),
    )
  })

  it.each([
    {
      name: 'version conflict',
      error: {
        code: '40001',
        hint: 'TICKETING_VERSION_CONFLICT',
        details: JSON.stringify({ bookingVersion: 8, rootTransactionVersion: 11 }),
      },
      status: 409,
      code: 'VERSION_CONFLICT',
      currentVersions: { bookingVersion: 8, rootTransactionVersion: 11 },
    },
    {
      name: 'idempotency conflict',
      error: { code: '22023', hint: 'TICKETING_IDEMPOTENCY_CONFLICT' },
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      currentVersions: undefined,
    },
    {
      name: 'affected quantity overflow',
      error: { code: '22023', hint: 'TICKETING_AFFECTED_QUANTITY_EXCEEDED' },
      status: 400,
      code: 'AFFECTED_QUANTITY_EXCEEDED',
      currentVersions: undefined,
    },
    {
      name: 'service date before the root issue',
      error: { code: '22023', hint: 'TICKETING_SERVICE_DATE_BEFORE_ROOT' },
      status: 400,
      code: 'SERVICE_DATE_BEFORE_ROOT',
      currentVersions: undefined,
    },
    {
      name: 'reissue date before its predecessor',
      error: { code: '22023', hint: 'TICKETING_REISSUE_DATE_BEFORE_PREDECESSOR' },
      status: 400,
      code: 'REISSUE_DATE_BEFORE_PREDECESSOR',
      currentVersions: undefined,
    },
    {
      name: 'reissue chain conflict',
      error: { code: '23514', hint: 'TICKETING_REISSUE_CHAIN_CONFLICT' },
      status: 409,
      code: 'CORRECTION_REQUIRED',
      currentVersions: undefined,
    },
    {
      name: 'posted source correction',
      error: { code: '55000', hint: 'TICKETING_CORRECTION_REQUIRED' },
      status: 409,
      code: 'CORRECTION_REQUIRED',
      currentVersions: undefined,
    },
    {
      name: 'hidden owner mismatch',
      error: { code: 'P0002', hint: 'TICKETING_RECORD_NOT_FOUND' },
      status: 404,
      code: undefined,
      currentVersions: undefined,
    },
  ])(
    'maps $name without leaking database details',
    async ({ error, status, code, currentVersions }) => {
      mocks.state.append = { data: null, error }

      const response = await POST(request(validEntry()), context())
      const body = await response.json()

      expect(response.status).toBe(status)
      expect(body.code).toBe(code)
      expect(body.currentVersions).toEqual(currentVersions)
      expect(JSON.stringify(body)).not.toContain('TICKETING_')
    },
  )

  it('rejects an RPC result that does not match the path and requested service facts', async () => {
    mocks.state.append = {
      data: {
        ...rpcResult(),
        transaction: { ...rpcResult().transaction, serviceType: 'R-ER' },
      },
      error: null,
    }

    const response = await POST(request(validEntry()), context())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Ticketing returned an invalid service-entry result.',
    })
  })

  it('fails closed on missing replay semantics or drifted GBP and business-date facts', async () => {
    const malformedResults = [
      { ...rpcResult(), idempotentReplay: undefined },
      {
        ...rpcResult(),
        transaction: { ...rpcResult().transaction, currency: 'EUR' },
      },
      {
        ...rpcResult(),
        transaction: { ...rpcResult().transaction, bookingDate: '2026-08-24' },
      },
      {
        ...rpcResult(),
        transaction: { ...rpcResult().transaction, issuedOn: '2026-08-24' },
      },
      {
        ...rpcResult(),
        transaction: { ...rpcResult().transaction, issuedAt: 'not-a-timestamptz' },
      },
    ]

    for (const [index, data] of malformedResults.entries()) {
      mocks.state.append = { data, error: null }
      const response = await POST(request(validEntry(), `malformed-result-${index}`), context())

      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({
        error: 'Ticketing returned an invalid service-entry result.',
      })
    }
  })

  it('requires a paid RPC result to match the requested paid business date exactly', async () => {
    const entry = {
      ...validEntry(),
      paymentStatus: 'paid' as const,
      paidAt: '2026-08-23',
    }
    mocks.state.append = {
      data: {
        ...rpcResult(),
        transaction: {
          ...rpcResult().transaction,
          paymentStatus: 'paid',
          paidAt: '2026-08-24T00:00:00.000Z',
          paidOn: '2026-08-24',
        },
      },
      error: null,
    }

    const response = await POST(request(entry, 'paid-date-drift'), context())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Ticketing returned an invalid service-entry result.',
    })
  })

  it('does not expose an unmapped database validation message', async () => {
    mocks.state.append = {
      data: null,
      error: { code: '23514', message: 'internal relation and constraint details' },
    }

    const response = await POST(request(validEntry()), context())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid DC/R-ER entry.' })
  })
})
