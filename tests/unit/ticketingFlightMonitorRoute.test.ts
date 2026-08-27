import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const OWNER_ID = '40000000-0000-4000-8000-000000000002'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'
const SECTOR_ID = '89000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  type Result = { data?: unknown; error?: unknown; count?: number | null }
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const state: {
    capability: Result
    counts: Result[]
    sectors: Result
    airports: Result
    changes: Result
  } = {
    capability: {},
    counts: [],
    sectors: {},
    airports: {},
    changes: {},
  }

  function query(result: () => Result) {
    const value: Record<string, ReturnType<typeof vi.fn>> & {
      then?: PromiseLike<Result>['then']
    } = {}
    for (const method of ['select', 'eq', 'is', 'gte', 'or', 'order', 'limit', 'in']) {
      value[method] = vi.fn(() => value)
    }
    value.then = (onFulfilled, onRejected) =>
      Promise.resolve(result()).then(onFulfilled, onRejected)
    return value
  }

  const countQueries: Array<ReturnType<typeof query>> = []
  let sectorCall = 0
  let listQuery = query(() => state.sectors)
  let airportQuery = query(() => state.airports)
  let changeQuery = query(() => state.changes)

  const from = vi.fn((table: string) => {
    if (table === 'ticket_itinerary_sectors') {
      if (sectorCall < 3) {
        const index = sectorCall
        sectorCall += 1
        const countQuery = query(() => state.counts[index] || { count: null, error: null })
        countQueries.push(countQuery)
        return countQuery
      }
      sectorCall += 1
      return listQuery
    }
    if (table === 'ticket_airports') return airportQuery
    if (table === 'ticket_active_schedule_changes') return changeQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn(async (name: string) => {
    if (name === 'ticketing_schema_status') return state.capability
    throw new Error(`Unexpected RPC: ${name}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))
  const resetQueries = () => {
    sectorCall = 0
    countQueries.splice(0)
    listQuery = query(() => state.sectors)
    airportQuery = query(() => state.airports)
    changeQuery = query(() => state.changes)
  }

  return {
    requireTicketingAccess,
    enforceRateLimit,
    state,
    countQueries,
    get listQuery() {
      return listQuery
    },
    get airportQuery() {
      return airportQuery
    },
    get changeQuery() {
      return changeQuery
    },
    from,
    rpc,
    getServiceSupabaseClient,
    resetQueries,
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

import { GET } from '@/app/api/ticketing/flight-monitor/route'

function request(query = '') {
  return new NextRequest(`http://localhost/api/ticketing/flight-monitor${query ? `?${query}` : ''}`)
}

function sectorRow(
  options: {
    id?: string
    status?: 'on_schedule' | 'change_marked' | 'awaiting_finalisation'
    bookingStatus?: 'held' | 'issued'
    allocations?: unknown[]
  } = {},
) {
  return {
    id: options.id || SECTOR_ID,
    booking_id: BOOKING_ID,
    sequence_number: 1,
    itinerary_version: 2,
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
    schedule_status: options.status || 'on_schedule',
    is_active: true,
    retired_at: null,
    airline: { id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' },
    ticket_bookings: {
      id: BOOKING_ID,
      version: 4,
      pnr: 'ABC123',
      customer_name: 'Paying Customer',
      contact_phone: '+44 7700 900123',
      operational_status: options.bookingStatus || 'issued',
      owner_employee_id: OWNER_ID,
      archived_at: null,
      owner: { id: OWNER_ID, full_name: 'Another Agent' },
    },
    source_transaction: {
      id: TRANSACTION_ID,
      service_type: 'TK',
      parent_transaction_id: null,
      operational_status: 'issued',
      passenger_ticket_count: 3,
      ticket_transaction_passengers:
        options.allocations === undefined
          ? [
              {
                id: '86000000-0000-4000-8000-000000000003',
                position: 1,
                ticket_passengers: {
                  id: '84000000-0000-4000-8000-000000000003',
                  passenger_type: 'CHD',
                  full_name: 'Child Traveller',
                },
              },
              {
                id: '86000000-0000-4000-8000-000000000002',
                position: 2,
                ticket_passengers: {
                  id: '84000000-0000-4000-8000-000000000002',
                  passenger_type: 'ADT',
                  full_name: 'Second Adult',
                },
              },
              {
                id: '86000000-0000-4000-8000-000000000001',
                position: 1,
                ticket_passengers: {
                  id: '84000000-0000-4000-8000-000000000001',
                  passenger_type: 'ADT',
                  full_name: 'Lead Traveller',
                },
              },
            ]
          : options.allocations,
    },
  }
}

function activeChangeRow() {
  return {
    sector_id: SECTOR_ID,
    change_case_id: '88000000-0000-4000-8000-000000000001',
    event_version: 1,
    proposed_schedule: {
      flightNumber: 'TK 201',
      departureLocal: '2026-09-01T12:30:00',
      departureAtUtc: '2026-09-01T11:30:00+00:00',
      arrivalLocal: null,
      arrivalAtUtc: null,
    },
    marked_by_employee_id: ACTOR_ID,
    marked_by_employee_name: 'Ticketing Agent',
    marked_at: '2026-08-27T10:00:00+00:00',
    mark_reason: 'Airline email received',
    reviewed_by_employee_id: null,
    reviewed_by_employee_name: null,
    reviewed_at: null,
    review_reason: null,
  }
}

describe('GET /api/ticketing/flight-monitor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-26T12:00:00.000Z'))
    vi.clearAllMocks()
    mocks.resetQueries()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID, email: 'agent@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'agent@example.test',
        fullName: 'Ticketing Agent',
        role: 'Ticketing Agent',
        departments: ['Ticketing'],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 0,
    })
    mocks.state.capability = {
      data: { ready: true, version: 2026082701 },
      error: null,
    }
    mocks.state.counts = [
      { count: 1, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
    ]
    mocks.state.sectors = { data: [sectorRow()], error: null }
    mocks.state.airports = {
      data: [
        { iata_code: 'LHR', timezone: 'Europe/London' },
        { iata_code: 'IST', timezone: 'Europe/Istanbul' },
      ],
      error: null,
    }
    mocks.state.changes = { data: [], error: null }
  })

  it('authenticates before rate limiting or service-role access', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns all-agent operational rows and exact dashboard counts without financial data', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body).toEqual({
      generatedAt: '2026-08-26T12:00:00.000Z',
      counts: { upcoming: 1, changeMarked: 0, awaitingFinalisation: 0 },
      items: [
        {
          bookingId: BOOKING_ID,
          bookingVersion: 4,
          sectorId: SECTOR_ID,
          itineraryVersion: 2,
          sequenceNumber: 1,
          ownerEmployee: { id: OWNER_ID, fullName: 'Another Agent' },
          leadPassenger: 'Lead Traveller',
          pnr: 'ABC123',
          contactPhone: '+44 7700 900123',
          passengerCount: 3,
          bookingStatus: 'issued',
          airline: { id: AIRLINE_ID, iataCode: 'TK', name: 'Turkish Airlines' },
          flightNumber: 'TK 199',
          originIata: 'LHR',
          originTimezone: 'Europe/London',
          destinationIata: 'IST',
          destinationTimezone: 'Europe/Istanbul',
          departureLocal: '2026-09-01T10:30:00',
          departureAtUtc: '2026-09-01T09:30:00+00:00',
          arrivalLocal: null,
          arrivalAtUtc: null,
          scheduleStatus: 'on_schedule',
          activeScheduleChange: null,
          allowedScheduleActions: ['mark'],
        },
      ],
      nextCursor: null,
    })

    const selection = String(mocks.listQuery.select.mock.calls[0]?.[0] || '')
    expect(selection).toContain('ticket_transaction_passengers')
    expect(selection).not.toMatch(/supplier|fare|sale|payment|package|profit|commission|margin/i)
    expect(JSON.stringify(body)).not.toMatch(
      /supplier|fare|sale|payment|package|profit|commission|margin|earnings/i,
    )
    expect(mocks.listQuery.eq).not.toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(mocks.listQuery.eq).not.toHaveBeenCalledWith(
      'ticket_bookings.owner_employee_id',
      ACTOR_ID,
    )
  })

  it('falls back to the customer name only when no persisted passenger name exists', async () => {
    mocks.state.sectors = { data: [sectorRow({ allocations: [] })], error: null }

    const response = await GET(request())

    expect(response.status).toBe(200)
    expect((await response.json()).items[0].leadPassenger).toBe('Paying Customer')
  })

  it('returns the active change and keeps resolution actions owner/admin-only', async () => {
    mocks.state.sectors = { data: [sectorRow({ status: 'change_marked' })], error: null }
    mocks.state.changes = { data: [activeChangeRow()], error: null }

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0].activeScheduleChange).toEqual(
      expect.objectContaining({
        changeId: '88000000-0000-4000-8000-000000000001',
        markReason: 'Airline email received',
        reviewedBy: null,
      }),
    )
    expect(body.items[0].allowedScheduleActions).toEqual([])
    expect(mocks.changeQuery.in).toHaveBeenCalledWith('sector_id', [SECTOR_ID])

    mocks.resetQueries()
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: true,
      scope: 'own',
      user: { id: OWNER_ID, email: 'owner@example.test' },
      employee: {
        id: OWNER_ID,
        email: 'owner@example.test',
        fullName: 'Another Agent',
        role: 'Ticketing Agent',
        departments: ['Ticketing'],
      },
    })
    const ownerResponse = await GET(request())
    expect((await ownerResponse.json()).items[0].allowedScheduleActions).toEqual([
      'review',
      'dismiss',
    ])
  })

  it('keeps Held TK records out of Flight Monitoring', async () => {
    mocks.state.counts = [
      { count: 0, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
    ]
    mocks.state.sectors = { data: [], error: null }

    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items).toEqual([])
    expect(body.counts.upcoming).toBe(0)
    expect(mocks.listQuery.eq).toHaveBeenCalledWith('ticket_bookings.operational_status', 'issued')
    for (const query of mocks.countQueries) {
      expect(query.eq).toHaveBeenCalledWith('ticket_bookings.operational_status', 'issued')
    }
  })

  it('binds an opaque cursor to its normalized status filter', async () => {
    mocks.state.sectors = {
      data: [sectorRow(), sectorRow({ id: '89000000-0000-4000-8000-000000000002' })],
      error: null,
    }
    const firstResponse = await GET(request('status=on_schedule&limit=1'))
    const firstBody = await firstResponse.json()

    expect(firstResponse.status).toBe(200)
    expect(firstBody.nextCursor).toEqual(expect.any(String))

    const mismatched = await GET(
      request(`status=change_marked&limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`),
    )
    expect(mismatched.status).toBe(400)
  })

  it('applies a valid same-filter cursor and deterministic ordering', async () => {
    const encoded = Buffer.from(
      JSON.stringify({
        departureAtUtc: '2026-09-01T09:30:00+00:00',
        sectorId: SECTOR_ID,
        status: 'on_schedule',
      }),
      'utf8',
    ).toString('base64url')

    const response = await GET(
      request(`status=on_schedule&cursor=${encodeURIComponent(encoded)}&limit=12`),
    )

    expect(response.status).toBe(200)
    expect(mocks.listQuery.eq).toHaveBeenCalledWith('schedule_status', 'on_schedule')
    expect(mocks.listQuery.or).toHaveBeenCalledWith(expect.stringContaining(`id.gt.${SECTOR_ID}`))
    expect(mocks.listQuery.order).toHaveBeenCalledWith('departure_at_utc', { ascending: true })
    expect(mocks.listQuery.order).toHaveBeenCalledWith('id', { ascending: true })
    expect(mocks.listQuery.limit).toHaveBeenCalledWith(13)
  })

  it('rejects malformed, duplicate, unrelated, and mismatched filters before database access', async () => {
    const wrongFilterCursor = Buffer.from(
      JSON.stringify({
        departureAtUtc: '2026-09-01T09:30:00+00:00',
        sectorId: SECTOR_ID,
        status: 'change_marked',
      }),
      'utf8',
    ).toString('base64url')

    for (const query of [
      'owner=staff',
      'status=on_schedule&status=change_marked',
      'limit=0',
      'limit=101',
      'cursor=not-a-cursor',
      `status=on_schedule&cursor=${wrongFilterCursor}`,
    ]) {
      expect((await GET(request(query))).status, query).toBe(400)
    }
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('fails closed on unavailable capability, count errors, and malformed rows', async () => {
    mocks.state.capability = { data: { ready: true, version: 2026082602 }, error: null }
    expect((await GET(request())).status).toBe(503)

    mocks.state.capability = { data: { ready: true, version: 2026082701 }, error: null }
    mocks.resetQueries()
    mocks.state.counts = [
      { count: null, error: { code: 'DB_ERROR', message: 'private data' } },
      { count: 0, error: null },
      { count: 0, error: null },
    ]
    expect((await GET(request())).status).toBe(500)

    mocks.resetQueries()
    mocks.state.counts = [
      { count: 1, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
    ]
    mocks.state.sectors = {
      data: [sectorRow({ bookingStatus: 'held' })],
      error: null,
    }
    expect((await GET(request())).status).toBe(500)
  })

  it('enforces a bounded actor/IP read rate before service-role access', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
    })

    const response = await GET(request())

    expect(response.status).toBe(429)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.flight-monitor',
        limit: 120,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
