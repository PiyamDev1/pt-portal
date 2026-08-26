import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const OWNER_ID = '40000000-0000-4000-8000-000000000002'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'
const SECTOR_ID = '89000000-0000-4000-8000-000000000001'
const REQUEST_ID = '90000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  type Result = { data?: unknown; error?: unknown }
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const state: {
    capability: Result
    replacement: Result
    booking: Result
    sectors: Result
    airports: Result
  } = {
    capability: {},
    replacement: {},
    booking: {},
    sectors: {},
    airports: {},
  }

  function query(result: () => Result) {
    const value: Record<string, ReturnType<typeof vi.fn>> & {
      then?: PromiseLike<Result>['then']
    } = {}
    for (const method of ['select', 'eq', 'in', 'is', 'order', 'limit']) {
      value[method] = vi.fn(() => value)
    }
    value.maybeSingle = vi.fn(async () => result())
    value.then = (onFulfilled, onRejected) => Promise.resolve(result()).then(onFulfilled, onRejected)
    return value
  }

  const bookingQuery = query(() => state.booking)
  const sectorQuery = query(() => state.sectors)
  const airportQuery = query(() => state.airports)
  const from = vi.fn((table: string) => {
    if (table === 'ticket_bookings') return bookingQuery
    if (table === 'ticket_itinerary_sectors') return sectorQuery
    if (table === 'ticket_airports') return airportQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn(async (name: string) => {
    if (name === 'ticketing_schema_status') return state.capability
    if (name === 'ticketing_replace_root_tk_itinerary') return state.replacement
    throw new Error(`Unexpected RPC: ${name}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))

  return {
    requireTicketingAccess,
    enforceRateLimit,
    state,
    bookingQuery,
    sectorQuery,
    airportQuery,
    from,
    rpc,
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

import { GET, PUT } from '@/app/api/ticketing/bookings/[bookingId]/sectors/route'

function access(role = 'Manager', employeeId = ACTOR_ID) {
  return {
    authorized: true,
    scope: 'team',
    user: { id: employeeId, email: 'agent@example.test' },
    employee: {
      id: employeeId,
      email: 'agent@example.test',
      fullName: 'Ticketing Agent',
      role,
      departments: role === 'Ticketing Agent' ? ['Ticketing'] : [],
    },
  }
}

function bookingRow(options: { status?: 'held' | 'issued'; ownerId?: string } = {}) {
  const status = options.status || 'issued'
  const ownerId = options.ownerId || ACTOR_ID
  return {
    id: BOOKING_ID,
    version: 4,
    pnr: 'ABC123',
    customer_name: 'Lead Passenger',
    operational_status: status,
    owner_employee_id: ownerId,
    archived_at: null,
    owner: { id: ownerId, full_name: ownerId === ACTOR_ID ? 'Ticketing Agent' : 'Owner Agent' },
    default_airline: { id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' },
    ticket_transactions: {
      id: TRANSACTION_ID,
      service_type: 'TK',
      parent_transaction_id: null,
      operational_status: status,
    },
  }
}

function sectorRow() {
  return {
    id: SECTOR_ID,
    sequence_number: 1,
    itinerary_version: 1,
    airline_id: AIRLINE_ID,
    flight_number: 'TK 199',
    origin_airport_code: 'LHR',
    destination_airport_code: 'IST',
    departure_local: '2026-09-01T10:30:00',
    departure_timezone: 'Europe/London',
    departure_at_utc: '2026-09-01T09:30:00+00:00',
    arrival_local: null,
    arrival_timezone: null,
    arrival_at_utc: null,
    schedule_status: 'on_schedule',
    is_active: true,
    retired_at: null,
    airline: { id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' },
  }
}

function replacementResult(options: { replay?: boolean; ownerId?: string } = {}) {
  const ownerId = options.ownerId || ACTOR_ID
  return {
    booking: {
      id: BOOKING_ID,
      version: 4,
      ownerEmployeeId: ownerId,
      ownerEmployeeName: ownerId === ACTOR_ID ? 'Ticketing Agent' : 'Owner Agent',
      pnr: 'ABC123',
      customerName: 'Lead Passenger',
      operationalStatus: 'issued',
      defaultAirline: { id: AIRLINE_ID, iataCode: 'TK', name: 'Turkish Airlines' },
    },
    rootTransaction: { id: TRANSACTION_ID },
    itineraryVersion: 1,
    sectors: [
      {
        id: SECTOR_ID,
        sequenceNumber: 1,
        itineraryVersion: 1,
        airlineId: AIRLINE_ID,
        airlineCode: 'TK',
        airlineName: 'Turkish Airlines',
        flightNumber: 'TK 199',
        originAirportCode: 'LHR',
        originTimezone: 'Europe/London',
        destinationAirportCode: 'IST',
        destinationTimezone: 'Europe/Istanbul',
        departureLocal: '2026-09-01T10:30:00',
        departureAtUtc: '2026-09-01T09:30:00+00:00',
        arrivalLocal: null,
        arrivalAtUtc: null,
        scheduleStatus: 'on_schedule',
      },
    ],
    auditEventId: options.replay ? '88000000-0000-4000-8000-000000000001' : null,
    changed: true,
    idempotentReplay: options.replay === true,
  }
}

function context(bookingId = BOOKING_ID) {
  return { params: Promise.resolve({ bookingId }) }
}

function putRequest(body: unknown = validEntry()) {
  return new NextRequest(`http://localhost/api/ticketing/bookings/${BOOKING_ID}/sectors`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validEntry() {
  return {
    requestId: REQUEST_ID,
    expectedVersion: 0,
    sectors: [
      {
        flightNumber: 'tk 199',
        originIata: 'lhr',
        destinationIata: 'ist',
        departureLocal: '2026-09-01T10:30',
        arrivalLocal: null,
      },
    ],
  }
}

describe('/api/ticketing/bookings/[bookingId]/sectors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue(access())
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 29,
      retryAfterSeconds: 0,
    })
    mocks.state.capability = {
      data: { ready: true, version: 2026082602, requiredVersion: 2026082602 },
      error: null,
    }
    mocks.state.replacement = { data: replacementResult(), error: null }
    mocks.state.booking = { data: bookingRow(), error: null }
    mocks.state.sectors = { data: [sectorRow()], error: null }
    mocks.state.airports = {
      data: [
        { iata_code: 'LHR', timezone: 'Europe/London', is_active: true },
        { iata_code: 'IST', timezone: 'Europe/Istanbul', is_active: true },
      ],
      error: null,
    }
  })

  it('authenticates before creating a service-role client', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/bookings/${BOOKING_ID}/sectors`),
      context(),
    )

    expect(response.status).toBe(401)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('loads an owner-only active itinerary with no financial or commission fields', async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/bookings/${BOOKING_ID}/sectors`),
      context(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.bookingQuery.eq).toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(mocks.bookingQuery.in).toHaveBeenCalledWith('ticket_transactions.operational_status', [
      'held',
      'issued',
    ])
    expect(mocks.sectorQuery.eq).toHaveBeenCalledWith('source_transaction_id', TRANSACTION_ID)
    expect(body).toMatchObject({
      booking: {
        id: BOOKING_ID,
        ownerEmployee: { id: ACTOR_ID, fullName: 'Ticketing Agent' },
      },
      context: { isOnBehalf: false, onBehalfReasonRequired: false },
      itineraryVersion: 1,
      sectors: [
        {
          originIata: 'LHR',
          originTimezone: 'Europe/London',
          destinationIata: 'IST',
          destinationTimezone: 'Europe/Istanbul',
        },
      ],
    })
    expect(JSON.stringify(body)).not.toMatch(
      /supplier|fare|sale|payment|package|profit|commission|margin|earnings/i,
    )
  })

  it('allows an owner to load an empty itinerary while the root TK is Held', async () => {
    mocks.state.booking = { data: bookingRow({ status: 'held' }), error: null }
    mocks.state.sectors = { data: [], error: null }

    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/bookings/${BOOKING_ID}/sectors`),
      context(),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      booking: { operationalStatus: 'held' },
      itineraryVersion: 0,
      sectors: [],
    })
  })

  it('allows only canonical administrators to read a non-owned itinerary', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce(access('Master Admin'))
    mocks.state.booking = { data: bookingRow({ ownerId: OWNER_ID }), error: null }

    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/bookings/${BOOKING_ID}/sectors`),
      context(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.bookingQuery.eq).not.toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(body.context).toEqual({ isOnBehalf: true, onBehalfReasonRequired: true })
  })

  it('maps the strict browser DTO to the authoritative RPC without timezone or UTC input', async () => {
    const response = await PUT(putRequest(), context())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_replace_root_tk_itinerary', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_expected_itinerary_version: 0,
      p_idempotency_key: REQUEST_ID,
      p_sectors: [
        {
          airlineId: null,
          flightNumber: 'TK 199',
          originAirportCode: 'LHR',
          destinationAirportCode: 'IST',
          departureLocal: '2026-09-01T10:30',
          arrivalLocal: null,
        },
      ],
      p_on_behalf_reason: null,
    })
    expect(body).toMatchObject({
      itineraryVersion: 1,
      changed: true,
      idempotentReplay: false,
      sectors: [{ destinationTimezone: 'Europe/Istanbul' }],
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns a stored exact replay without a mutable current-ownership reload', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce(access('Ticketing Agent'))
    mocks.state.replacement = { data: replacementResult({ replay: true }), error: null }

    const response = await PUT(putRequest(), context())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.idempotentReplay).toBe(true)
    expect(body.booking.ownerEmployee.id).toBe(ACTOR_ID)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects caller-derived timezone/UTC fields before creating a service client', async () => {
    const entry = validEntry()
    const response = await PUT(
      putRequest({
        ...entry,
        sectors: [
          {
            ...entry.sectors[0],
            departureTimezone: 'Europe/London',
            departureAtUtc: '2026-09-01T09:30:00Z',
          },
        ],
      }),
      context(),
    )

    expect(response.status).toBe(400)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('fails closed on stale or malformed capability status', async () => {
    for (const capability of [
      { data: { ready: true, version: 2026082601 }, error: null },
      { data: [], error: null },
      { data: [{ ready: true, version: 2026082602 }, { ready: true, version: 2026082602 }] },
    ]) {
      mocks.state.capability = capability
      const response = await PUT(putRequest(), context())
      expect(response.status).toBe(503)
    }
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_replace_root_tk_itinerary',
      expect.anything(),
    )
  })

  it.each([
    [
      { code: '40001', hint: 'TICKETING_ITINERARY_VERSION_CONFLICT', details: '{"itineraryVersion":2}' },
      409,
      'VERSION_CONFLICT',
    ],
    [{ code: '22023', hint: 'TICKETING_LOCAL_TIME_GAP' }, 400, 'INVALID_LOCAL_TIME'],
    [
      { code: '22023', hint: 'TICKETING_ITINERARY_CHRONOLOGY_INVALID' },
      400,
      'INVALID_ITINERARY_CHRONOLOGY',
    ],
    [
      { code: '22023', hint: 'TICKETING_ON_BEHALF_REASON_REQUIRED' },
      400,
      'ON_BEHALF_REASON_REQUIRED',
    ],
    [{ code: '42501', hint: 'TICKETING_ON_BEHALF_FORBIDDEN' }, 403, undefined],
  ])('maps database error hints without exposing raw details', async (error, status, code) => {
    mocks.state.replacement = {
      data: null,
      error: {
        ...error,
        message: 'Secret PNR ABC123 and customer phone +44 7700 900123',
      },
    }

    const response = await PUT(putRequest(), context())
    const body = await response.json()

    expect(response.status).toBe(status)
    if (code) expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toMatch(/ABC123|7700|secret/i)
  })

  it('requires the database snapshot to match a self-service actor and response contract', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce(access('Ticketing Agent'))
    mocks.state.replacement = { data: replacementResult({ ownerId: OWNER_ID }), error: null }
    expect((await PUT(putRequest(), context())).status).toBe(500)

    mocks.state.replacement = {
      data: { ...replacementResult(), sectors: [{ timezone: 'caller supplied' }] },
      error: null,
    }
    expect((await PUT(putRequest(), context())).status).toBe(500)
  })

  it('enforces a bounded actor/IP mutation rate before database access', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
    })

    const response = await PUT(putRequest(), context())

    expect(response.status).toBe(429)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.replace-root-itinerary',
        limit: 30,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
