import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const detailMaybeSingle = vi.fn()
  const detailArchivedIs = vi.fn(() => ({ maybeSingle: detailMaybeSingle }))
  const detailParentIs = vi.fn(() => ({ is: detailArchivedIs }))
  const detailServiceEq = vi.fn(() => ({ is: detailParentIs }))
  const detailOwnerEq = vi.fn(() => ({ eq: detailServiceEq }))
  const detailBookingEq = vi.fn(() => ({ eq: detailOwnerEq }))
  const detailSelect = vi.fn(() => ({ eq: detailBookingEq }))
  const state: {
    capability: { data: unknown; error: unknown }
    completion: { data: unknown; error: unknown }
  } = {
    capability: { data: null, error: null },
    completion: { data: null, error: null },
  }
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'ticketing_schema_status') return state.capability
    if (functionName === 'ticketing_complete_tk_details') return state.completion
    throw new Error(`Unexpected RPC: ${functionName}`)
  })
  const from = vi.fn((table: string) => {
    if (table === 'ticket_transactions') return { select: detailSelect }
    throw new Error(`Unexpected table: ${table}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))

  return {
    requireTicketingAccess,
    enforceRateLimit,
    detailMaybeSingle,
    detailArchivedIs,
    detailParentIs,
    detailServiceEq,
    detailOwnerEq,
    detailBookingEq,
    detailSelect,
    state,
    rpc,
    from,
    getServiceSupabaseClient,
  }
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

import { GET, PATCH } from '@/app/api/ticketing/ledger/[bookingId]/route'

function detailRow(options: { complete?: boolean; paid?: boolean } = {}) {
  const complete = options.complete === true
  const paid = options.paid === true
  return {
    id: TRANSACTION_ID,
    version: 7,
    operational_status: 'issued',
    payment_status: paid ? 'paid' : 'unpaid',
    paid_at: paid ? '2026-08-21T23:00:00.000Z' : null,
    ticket_bookings: {
      id: BOOKING_ID,
      version: 4,
      pnr: 'ABC123',
      customer_name: 'Lead Passenger',
      contact_phone: complete ? '+44 7700 900123' : null,
      departure_date: complete ? '2026-09-01' : null,
      return_date: null,
      archived_at: null,
      airlines: { id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' },
      locations: { timezone: 'Europe/London' },
    },
    ticket_passenger_fare_lines: [
      {
        id: '85000000-0000-4000-8000-000000000001',
        passenger_type: 'ADT',
        quantity: 2,
        unit_supplier_cost_source: '400.00',
        unit_sale_price_source: complete ? '500.00' : null,
      },
    ],
    ticket_transaction_passengers: complete
      ? [
          {
            id: '86000000-0000-4000-8000-000000000001',
            position: 2,
            ticket_number: null,
            ticket_passengers: {
              id: '84000000-0000-4000-8000-000000000002',
              passenger_type: 'ADT',
              full_name: 'Second Passenger',
              contact_phone: null,
              date_of_birth: null,
            },
          },
          {
            id: '86000000-0000-4000-8000-000000000002',
            position: 1,
            ticket_number: '235-1234567890',
            ticket_passengers: {
              id: '84000000-0000-4000-8000-000000000001',
              passenger_type: 'ADT',
              full_name: 'Lead Passenger',
              contact_phone: '+44 7700 900123',
              date_of_birth: null,
            },
          },
        ]
      : [],
  }
}

function validPatch() {
  return {
    expectedBookingVersion: 4,
    expectedTransactionVersion: 7,
    contactPhone: '+44 7700 900123',
    departureDate: '2026-09-01',
    returnDate: null,
    paymentStatus: 'unpaid' as const,
    paidAt: null,
    fareSales: [{ passengerType: 'ADT' as const, unitSalePrice: 500 }],
    passengers: [
      {
        passengerType: 'ADT' as const,
        position: 1,
        fullName: 'Lead Passenger',
        contactPhone: null,
        dateOfBirth: null,
        ticketNumber: null,
      },
    ],
  }
}

function context(bookingId = BOOKING_ID) {
  return { params: Promise.resolve({ bookingId }) }
}

function patchRequest(body: unknown, idempotencyKey: string | null = 'complete-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idempotencyKey !== null) headers['Idempotency-Key'] = idempotencyKey
  return new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

describe('/api/ticketing/ledger/[bookingId]', () => {
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
      data: { ready: true, version: 2026082202, requiredVersion: 2026082202 },
      error: null,
    }
    mocks.state.completion = {
      data: {
        booking: { id: BOOKING_ID },
        transaction: { id: TRANSACTION_ID },
        changed: true,
        idempotentReplay: false,
      },
      error: null,
    }
    mocks.detailMaybeSingle.mockResolvedValue({ data: detailRow(), error: null })
  })

  it('authenticates before creating a service-role client', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`),
      context(),
    )

    expect(response.status).toBe(401)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('keeps the detail endpoint own-only even when the guard grants team scope', async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`),
      context(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.detailBookingEq).toHaveBeenCalledWith('booking_id', BOOKING_ID)
    expect(mocks.detailOwnerEq).toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(mocks.detailServiceEq).toHaveBeenCalledWith('service_type', 'TK')
    expect(body.detail).toMatchObject({
      bookingId: BOOKING_ID,
      transactionId: TRANSACTION_ID,
      bookingVersion: 4,
      transactionVersion: 7,
      detailsStatus: 'needs_details',
    })
    expect(body.detail.passengers).toEqual([
      {
        passengerType: 'ADT',
        position: 1,
        fullName: 'Lead Passenger',
        contactPhone: null,
        dateOfBirth: null,
        ticketNumber: null,
      },
      {
        passengerType: 'ADT',
        position: 2,
        fullName: null,
        contactPhone: null,
        dateOfBirth: null,
        ticketNumber: null,
      },
    ])
    expect(JSON.stringify(body)).not.toMatch(/commission|profit/i)
  })

  it('uses stable persisted allocation positions and branch-local paid dates', async () => {
    mocks.detailMaybeSingle.mockResolvedValueOnce({
      data: detailRow({ complete: true, paid: true }),
      error: null,
    })

    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`),
      context(),
    )
    const body = await response.json()

    expect(body.detail.detailsStatus).toBe('complete')
    expect(body.detail.paidAt).toBe('2026-08-22')
    expect(body.detail.fares[0].salePriceLocked).toBe(true)
    expect(
      body.detail.passengers.map((passenger: { position: number }) => passenger.position),
    ).toEqual([1, 2])
    expect(body.detail.passengers[0].ticketNumber).toBe('235-1234567890')
  })

  it('returns the same 404 for an invalid, missing, or other-owner booking ID', async () => {
    const invalid = await GET(
      new NextRequest('http://localhost/api/ticketing/ledger/not-a-uuid'),
      context('not-a-uuid'),
    )
    expect(invalid.status).toBe(404)

    mocks.detailMaybeSingle.mockResolvedValueOnce({ data: null, error: null })
    const hidden = await GET(
      new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`),
      context(),
    )
    expect(hidden.status).toBe(404)
    expect(await hidden.json()).toEqual({ error: 'Ticket record not found.' })
  })

  it('fails closed when completion capability is unavailable', async () => {
    mocks.state.capability = {
      data: { ready: true, version: 2026082201, requiredVersion: 2026082201 },
      error: null,
    }

    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`),
      context(),
    )

    expect(response.status).toBe(503)
    expect(mocks.detailSelect).not.toHaveBeenCalled()
  })

  it('rejects unknown identity fields and missing retry keys before invoking the RPC', async () => {
    const spoofed = await PATCH(
      patchRequest({ ...validPatch(), ownerEmployeeId: 'other-agent' }),
      context(),
    )
    expect(spoofed.status).toBe(400)

    const missingKey = await PATCH(patchRequest(validPatch(), null), context())
    expect(missingKey.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('enforces the mutation rate limit and 64 KiB body bound before service-role writes', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
    })
    const limited = await PATCH(patchRequest(validPatch()), context())
    expect(limited.status).toBe(429)

    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: true,
      remaining: 58,
      retryAfterSeconds: 0,
    })
    const oversized = await PATCH(
      patchRequest({ ...validPatch(), contactPhone: 'x'.repeat(70 * 1024) }),
      context(),
    )
    expect(oversized.status).toBe(400)
    expect(await oversized.json()).toEqual({ error: 'Request body is too large' })
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('passes only the verified actor, path booking, retry key, and strict details to one RPC', async () => {
    mocks.detailMaybeSingle.mockResolvedValueOnce({
      data: detailRow({ complete: true }),
      error: null,
    })

    const response = await PATCH(patchRequest(validPatch(), 'save-details-1'), context())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_complete_tk_details', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_idempotency_key: 'save-details-1',
      p_details: validPatch(),
    })
    expect(body).toMatchObject({
      changed: true,
      idempotentReplay: false,
      detail: { bookingId: BOOKING_ID, detailsStatus: 'complete' },
    })
    expect(JSON.stringify(body)).not.toMatch(/commission|profit/i)
  })

  it.each([
    {
      name: 'version conflict',
      error: {
        code: '40001',
        hint: 'TICKETING_VERSION_CONFLICT',
        details: JSON.stringify({ bookingVersion: 9, transactionVersion: 11 }),
      },
      status: 409,
      code: 'VERSION_CONFLICT',
    },
    {
      name: 'idempotency conflict',
      error: { code: '22023', hint: 'TICKETING_IDEMPOTENCY_CONFLICT' },
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
    },
    {
      name: 'posted correction',
      error: { code: '55000', hint: 'TICKETING_CORRECTION_REQUIRED' },
      status: 409,
      code: 'CORRECTION_REQUIRED',
    },
    {
      name: 'hidden owner mismatch',
      error: { code: 'P0002', hint: 'TICKETING_RECORD_NOT_FOUND' },
      status: 404,
      code: undefined,
    },
  ])('maps $name without leaking database details', async ({ error, status, code }) => {
    mocks.state.completion = { data: null, error }

    const response = await PATCH(patchRequest(validPatch()), context())
    const body = await response.json()

    expect(response.status).toBe(status)
    expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toContain('TICKETING_')
    expect(mocks.detailMaybeSingle).not.toHaveBeenCalled()
  })
})
