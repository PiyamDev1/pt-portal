import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const ROOT_TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const bookingLimit = vi.fn()
  const bookingIdOrder = vi.fn(() => ({ limit: bookingLimit }))
  const bookingUpdatedOrder = vi.fn(() => ({ order: bookingIdOrder }))
  const bookingCursorOr = vi.fn(() => ({ order: bookingUpdatedOrder }))
  const bookingTransactionStatusEq = vi.fn(() => ({
    or: bookingCursorOr,
    order: bookingUpdatedOrder,
  }))
  const bookingParentIs = vi.fn(() => ({ eq: bookingTransactionStatusEq }))
  const bookingServiceEq = vi.fn(() => ({ is: bookingParentIs }))
  const bookingArchivedIs = vi.fn(() => ({ eq: bookingServiceEq }))
  const bookingStatusEq = vi.fn(() => ({ is: bookingArchivedIs }))
  const bookingPnrEq = vi.fn(() => ({ eq: bookingStatusEq }))
  const bookingOwnerEq = vi.fn(() => ({ eq: bookingPnrEq }))
  const bookingSelect = vi.fn(() => ({ eq: bookingOwnerEq }))
  const policySingle = vi.fn()
  const policyEq = vi.fn(() => ({ single: policySingle }))
  const policySelect = vi.fn(() => ({ eq: policyEq }))
  const state: { capability: { data: unknown; error: unknown } } = {
    capability: { data: null, error: null },
  }
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'ticketing_schema_status') return state.capability
    throw new Error(`Unexpected RPC: ${functionName}`)
  })
  const from = vi.fn((table: string) => {
    if (table === 'ticket_bookings') return { select: bookingSelect }
    if (table === 'ticketing_staff_family_policy') return { select: policySelect }
    throw new Error(`Unexpected table: ${table}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))

  return {
    requireTicketingAccess,
    enforceRateLimit,
    bookingLimit,
    bookingIdOrder,
    bookingUpdatedOrder,
    bookingCursorOr,
    bookingTransactionStatusEq,
    bookingParentIs,
    bookingServiceEq,
    bookingArchivedIs,
    bookingStatusEq,
    bookingPnrEq,
    bookingOwnerEq,
    bookingSelect,
    policySingle,
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

import { GET } from '@/app/api/ticketing/bookings/route'

function bookingRow(id = BOOKING_ID, pnr = 'ABC123') {
  return {
    id,
    version: 4,
    updated_at: '2026-08-23T12:00:00.000Z',
    pnr,
    customer_name: 'Lead Passenger',
    contact_phone: '+44 7700 900123',
    departure_date: '2026-09-01',
    return_date: '2026-09-10',
    operational_status: 'issued',
    package_match_status: 'matched',
    commercial_treatment: 'standard',
    commission_waiver_reason: null,
    archived_at: null,
    airlines: { id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' },
    ticket_transactions: {
      id: ROOT_TRANSACTION_ID,
      version: 7,
      service_type: 'TK',
      operational_status: 'issued',
      parent_transaction_id: null,
      booking_date: '2026-08-23',
      ticket_passenger_fare_lines: [
        { passenger_type: 'CHD', quantity: 1 },
        { passenger_type: 'ADT', quantity: 2 },
      ],
    },
  }
}

function request(query = 'pnr=ab%20c123') {
  return new NextRequest(`http://localhost/api/ticketing/bookings?${query}`)
}

describe('GET /api/ticketing/bookings?pnr=', () => {
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
      remaining: 119,
      retryAfterSeconds: 0,
    })
    mocks.state.capability = {
      data: { ready: true, version: 2026083102, requiredVersion: 2026083102 },
      error: null,
    }
    mocks.bookingLimit.mockResolvedValue({ data: [bookingRow()], error: null })
    mocks.policySingle.mockResolvedValue({ data: { change_admin_fee_gbp: '25.00' }, error: null })
  })

  it('authenticates before rate limiting or creating a service-role client', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('normalizes an exact PNR and remains own-only even for team-scoped oversight', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.bookingOwnerEq).toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(mocks.bookingPnrEq).toHaveBeenCalledWith('normalized_pnr', 'ABC123')
    expect(mocks.bookingStatusEq).toHaveBeenCalledWith('operational_status', 'issued')
    expect(mocks.bookingServiceEq).toHaveBeenCalledWith('ticket_transactions.service_type', 'TK')
    expect(mocks.bookingParentIs).toHaveBeenCalledWith(
      'ticket_transactions.parent_transaction_id',
      null,
    )
    expect(mocks.bookingTransactionStatusEq).toHaveBeenCalledWith(
      'ticket_transactions.operational_status',
      'issued',
    )
    expect(mocks.bookingUpdatedOrder).toHaveBeenCalledWith('updated_at', { ascending: false })
    expect(mocks.bookingIdOrder).toHaveBeenCalledWith('id', { ascending: false })
    expect(mocks.bookingLimit).toHaveBeenCalledWith(11)
    expect(body).toEqual({
      hasMore: false,
      nextCursor: null,
      items: [
        {
          bookingId: BOOKING_ID,
          bookingVersion: 4,
          rootTransactionId: ROOT_TRANSACTION_ID,
          rootTransactionVersion: 7,
          rootBookingDate: '2026-08-23',
          pnr: 'ABC123',
          customerName: 'Lead Passenger',
          contactPhone: '+44 7700 900123',
          departureDate: '2026-09-01',
          returnDate: '2026-09-10',
          operationalStatus: 'issued',
          airline: { id: AIRLINE_ID, iataCode: 'TK', name: 'Turkish Airlines' },
          packageMatchStatus: 'matched',
          commercialTreatment: 'standard',
          commissionWaiverReason: null,
          staffFamilyChangeFeeGbp: 25,
          fares: [
            { passengerType: 'ADT', quantity: 2 },
            { passengerType: 'CHD', quantity: 1 },
          ],
          passengers: [],
        },
      ],
    })
    expect(JSON.stringify(body)).not.toMatch(/supplier|sale|profit|margin|earnings/i)
  })

  it('allows multiple own matches while making no match and hidden other-owner results identical', async () => {
    mocks.bookingLimit.mockResolvedValueOnce({
      data: [bookingRow(), bookingRow('80000000-0000-4000-8000-000000000002', 'ABC123')],
      error: null,
    })
    const multiple = await GET(request())
    expect((await multiple.json()).items).toHaveLength(2)

    mocks.bookingLimit.mockResolvedValueOnce({ data: [], error: null })
    const hiddenOrMissing = await GET(request())

    expect(hiddenOrMissing.status).toBe(200)
    expect(await hiddenOrMissing.json()).toEqual({ items: [], hasMore: false, nextCursor: null })
  })

  it('pages more than ten identical-PNR matches without silently hiding later records', async () => {
    const firstPageRows = Array.from({ length: 11 }, (_, index) =>
      bookingRow(`80000000-0000-4000-8000-${String(99 - index).padStart(12, '0')}`, 'ABC123'),
    )
    mocks.bookingLimit.mockResolvedValueOnce({ data: firstPageRows, error: null })

    const firstPage = await GET(request())
    const firstBody = await firstPage.json()

    expect(firstPage.status).toBe(200)
    expect(firstBody.items).toHaveLength(10)
    expect(firstBody.hasMore).toBe(true)
    expect(firstBody.nextCursor).toEqual(expect.any(String))

    const laterBookingId = '80000000-0000-4000-8000-000000000089'
    mocks.bookingLimit.mockResolvedValueOnce({
      data: [bookingRow(laterBookingId, 'ABC123')],
      error: null,
    })
    const nextPage = await GET(
      request(`pnr=ABC123&cursor=${encodeURIComponent(firstBody.nextCursor)}`),
    )
    const nextBody = await nextPage.json()

    expect(mocks.bookingCursorOr).toHaveBeenCalledWith(expect.stringContaining('updated_at.lt.'))
    expect(nextBody).toMatchObject({ hasMore: false, nextCursor: null })
    expect(nextBody.items.map((item: { bookingId: string }) => item.bookingId)).toEqual([
      laterBookingId,
    ])
  })

  it('rejects missing, duplicate, or unrelated query parameters before lookup work', async () => {
    expect((await GET(request(''))).status).toBe(400)
    expect((await GET(request('pnr=ABC123&pnr=DEF456'))).status).toBe(400)
    expect((await GET(request('pnr=ABC123&owner=other'))).status).toBe(400)
    expect((await GET(request('pnr=ABC123&cursor=not-a-cursor'))).status).toBe(400)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('enforces a bounded actor/IP lookup rate before database reads', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    })

    const response = await GET(request())

    expect(response.status).toBe(429)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.own-booking-pnr-lookup',
        limit: 120,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('fails closed when the DC/R-ER capability is unavailable', async () => {
    mocks.state.capability = {
      data: { ready: true, version: 2026082303, requiredVersion: 2026082303 },
      error: null,
    }

    const response = await GET(request())

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.bookingSelect).not.toHaveBeenCalled()
  })

  it('accepts a singleton-array DC/R-ER lookup capability response', async () => {
    mocks.state.capability = {
      data: [{ ready: true, version: 2026083102, requiredVersion: 2026083102 }],
      error: null,
    }

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect(mocks.bookingSelect).toHaveBeenCalled()
  })

  it('fails closed on malformed relational data rather than returning a partial prefill', async () => {
    mocks.bookingLimit.mockResolvedValueOnce({
      data: [
        {
          ...bookingRow(),
          ticket_transactions: { ...bookingRow().ticket_transactions, version: null },
        },
      ],
      error: null,
    })

    const response = await GET(request())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Unable to load that ticket safely.' })
  })
})
