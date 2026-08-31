import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const OWNER_ID = '40000000-0000-4000-8000-000000000002'
const HISTORICAL_OWNER_ID = '40000000-0000-4000-8000-000000000003'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const SECOND_BOOKING_ID = '80000000-0000-4000-8000-000000000002'
const ROOT_TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'
const SECOND_ROOT_TRANSACTION_ID = '81000000-0000-4000-8000-000000000002'
const ADJUSTMENT_ID = '82000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'
const ACTOR_LOCATION_ID = '60000000-0000-4000-8000-000000000001'
const BOOKING_LOCATION_ID = '60000000-0000-4000-8000-000000000002'
const PACKAGE_LINK_ID = '83000000-0000-4000-8000-000000000001'
const PACKAGE_ID = '84000000-0000-4000-8000-000000000001'
const RESERVATION_ID = '85000000-0000-4000-8000-000000000001'
const SOURCE_EVENT_ID = '86000000-0000-4000-8000-000000000001'
const AUDIT_EVENT_ID = '87000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const state: {
    capability: { data: unknown; error: unknown }
    append: { data: unknown; error: unknown }
    bookings: { data: unknown; error: unknown }
    currentAdjustments: { data: unknown; error: unknown }
    currentFareChecks: { data: unknown; error: unknown }
    filterOwners: { data: unknown; error: unknown }
  } = {
    capability: { data: null, error: null },
    append: { data: null, error: null },
    bookings: { data: null, error: null },
    currentAdjustments: { data: null, error: null },
    currentFareChecks: { data: null, error: null },
    filterOwners: { data: null, error: null },
  }

  function queryBuilder(result: () => { data: unknown; error: unknown }) {
    const builder: Record<string, any> = {}
    for (const method of [
      'select',
      'eq',
      'is',
      'not',
      'gt',
      'gte',
      'lte',
      'or',
      'order',
      'limit',
      'in',
    ]) {
      builder[method] = vi.fn(() => builder)
    }
    builder.then = (
      onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result()).then(onFulfilled, onRejected)
    return builder
  }

  const bookingQuery = queryBuilder(() => state.bookings)
  const currentAdjustmentQuery = queryBuilder(() => state.currentAdjustments)
  const currentFareCheckQuery = queryBuilder(() => state.currentFareChecks)
  const filterOwnerQuery = queryBuilder(() => state.filterOwners)
  const from = vi.fn((table: string) => {
    if (table === 'ticket_bookings') return bookingQuery
    if (table === 'ticket_fare_adjustment_current') return currentAdjustmentQuery
    if (table === 'ticket_fare_check_current') return currentFareCheckQuery
    if (table === 'ticket_low_fare_filter_owners') return filterOwnerQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'ticketing_schema_status') return state.capability
    if (functionName === 'ticketing_append_fare_adjustment_commercial') return state.append
    throw new Error(`Unexpected RPC: ${functionName}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))

  return {
    requireTicketingAccess,
    enforceRateLimit,
    state,
    bookingQuery,
    currentAdjustmentQuery,
    currentFareCheckQuery,
    filterOwnerQuery,
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

import { GET, POST } from '@/app/api/ticketing/fare-adjustments/route'

function bookingRow(
  options: {
    bookingId?: string
    rootTransactionId?: string
    pnr?: string
    normalizedPnr?: string
  } = {},
) {
  return {
    id: options.bookingId || BOOKING_ID,
    version: '4',
    owner_employee_id: OWNER_ID,
    pnr: options.pnr || 'ABC 123',
    normalized_pnr: options.normalizedPnr || 'ABC123',
    departure_date: '2026-09-01',
    return_date: '2026-09-15',
    operational_status: 'issued',
    package_match_status: 'matched',
    commission_scope: 'package',
    commercial_treatment: 'standard',
    updated_at: '2026-08-24T12:00:00.000Z',
    archived_at: null,
    airlines: { id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' },
    owner: { id: OWNER_ID, full_name: 'Other Ticketing Agent' },
    locations: { timezone: 'Europe/London' },
    root_transaction: {
      id: options.rootTransactionId || ROOT_TRANSACTION_ID,
      version: '7',
      owner_employee_id: OWNER_ID,
      service_type: 'TK',
      operational_status: 'issued',
      parent_transaction_id: null,
      issued_at: '2026-08-20T23:00:00.000Z',
      passenger_ticket_count: '2',
      currency: 'GBP',
      supplier_cost_source: '500.00',
      supplier_cost_gbp: '500.00',
      sale_price_gbp: '600.00',
    },
  }
}

function currentAdjustmentRow() {
  return {
    id: ADJUSTMENT_ID,
    booking_id: BOOKING_ID,
    root_transaction_id: ROOT_TRANSACTION_ID,
    previous_adjustment_id: null,
    sequence_number: '1',
    acting_employee_id: ACTOR_ID,
    owner_employee_id: OWNER_ID,
    currency: 'GBP',
    original_fare_source: '500.00',
    original_fare_gbp: '500.00',
    new_fare_source: '450.00',
    new_fare_gbp: '450.00',
    difference_source: '50.00',
    difference_gbp: '50.00',
    passenger_ticket_count: '2',
    effective_on: '2026-08-24',
    package_match_status: 'matched',
    commission_scope: 'package',
    created_at: '2026-08-24T13:00:00.000Z',
    staff_family_company_fee_percent: null,
    staff_family_customer_price_before_gbp: null,
    staff_family_company_fee_gbp: null,
    staff_family_customer_credit_gbp: null,
    staff_family_customer_additional_charge_gbp: null,
    staff_family_customer_price_after_gbp: null,
  }
}

function validEntry() {
  return {
    bookingId: BOOKING_ID,
    expectedBookingVersion: 4,
    expectedRootTransactionVersion: 7,
    expectedPreviousAdjustmentId: null,
    newSupplierFareGbp: 450,
    effectiveDate: '2026-08-24',
    notes: 'Found lower fare',
    currency: 'GBP' as const,
  }
}

function appendResult(options: { replay?: boolean; difference?: number } = {}) {
  const difference = options.difference ?? 50
  const newFare = 500 - difference
  return {
    commercialTreatment: 'standard',
    booking: {
      id: BOOKING_ID,
      version: 5,
      ownerEmployeeId: OWNER_ID,
      locationId: BOOKING_LOCATION_ID,
    },
    rootTransaction: {
      id: ROOT_TRANSACTION_ID,
      version: 7,
      passengerTicketCount: 2,
      supplierCostSource: 500,
      supplierCostGbp: 500,
    },
    adjustment: {
      id: ADJUSTMENT_ID,
      bookingId: BOOKING_ID,
      rootTransactionId: ROOT_TRANSACTION_ID,
      previousAdjustmentId: null,
      sequenceNumber: 1,
      actingEmployeeId: ACTOR_ID,
      ownerEmployeeId: OWNER_ID,
      actorLocationId: ACTOR_LOCATION_ID,
      bookingLocationId: BOOKING_LOCATION_ID,
      currency: 'GBP',
      originalFareSource: 500,
      originalFareGbp: 500,
      newFareSource: newFare,
      newFareGbp: newFare,
      differenceSource: difference,
      differenceGbp: difference,
      passengerTicketCount: 2,
      effectiveOn: '2026-08-24',
      notes: 'Found lower fare',
      packageMatchStatus: 'matched',
      commissionScope: 'package',
      packageLinkIds: [PACKAGE_LINK_ID],
      packageId: PACKAGE_ID,
      reservationId: RESERVATION_ID,
      groupId: null,
      packageType: 'umrah',
      createdAt: '2026-08-24T13:00:00.000Z',
    },
    sourceEvent: {
      sourceEventId: SOURCE_EVENT_ID,
      eventType: difference > 0 ? 'ticket_low_fare_adjusted' : 'ticket_higher_fare_adjusted',
      eventVersion: 1,
    },
    auditEventId: AUDIT_EVENT_ID,
    idempotentReplay: options.replay === true,
    staffFamilyReprice: null,
  }
}

function postRequest(body: unknown, idempotencyKey: string | null = 'low-fare-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idempotencyKey !== null) headers['Idempotency-Key'] = idempotencyKey
  return new NextRequest('http://localhost/api/ticketing/fare-adjustments', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('/api/ticketing/fare-adjustments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID, email: 'agent@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'agent@example.test',
        fullName: 'Acting Ticketing Agent',
        role: 'User',
        departments: ['Ticketing'],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 59,
      retryAfterSeconds: 0,
    })
    mocks.state.capability = {
      data: { ready: true, version: 2026083102, requiredVersion: 2026083102 },
      error: null,
    }
    mocks.state.bookings = { data: [bookingRow()], error: null }
    mocks.state.currentAdjustments = { data: [currentAdjustmentRow()], error: null }
    mocks.state.currentFareChecks = { data: [], error: null }
    mocks.state.filterOwners = {
      data: [{ employee_id: OWNER_ID, full_name: 'Other Ticketing Agent' }],
      error: null,
    }
    mocks.state.append = { data: appendResult(), error: null }
  })

  it('authenticates GET and POST before rate limiting or service-role access', async () => {
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    expect(
      (await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))).status,
    ).toBe(401)
    expect((await POST(postRequest(validEntry()))).status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns a bounded shared-agent queue with adjusted and unadjusted issued TK fares', async () => {
    mocks.state.bookings = {
      data: [
        bookingRow(),
        bookingRow({
          bookingId: SECOND_BOOKING_ID,
          rootTransactionId: SECOND_ROOT_TRANSACTION_ID,
          pnr: 'DEF456',
          normalizedPnr: 'DEF456',
        }),
      ],
      error: null,
    }

    const response = await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.low-fare-queue',
        limit: 120,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.bookingQuery.eq).not.toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(mocks.bookingQuery.eq).toHaveBeenCalledWith('root_transaction.service_type', 'TK')
    expect(mocks.bookingQuery.eq).toHaveBeenCalledWith('root_transaction.currency', 'GBP')
    expect(mocks.currentAdjustmentQuery.in).toHaveBeenCalledWith('booking_id', [
      BOOKING_ID,
      SECOND_BOOKING_ID,
    ])
    expect(body).toMatchObject({
      hasMore: false,
      nextCursor: null,
      items: [
        {
          bookingId: BOOKING_ID,
          pnr: 'ABC123',
          issuedDate: '2026-08-21',
          owner: { employeeId: OWNER_ID, fullName: 'Other Ticketing Agent' },
          initialSupplierFareGbp: 500,
          currentSupplierFareGbp: 450,
          latestAdjustment: {
            adjustmentId: ADJUSTMENT_ID,
            originalSupplierFareGbp: 500,
            newSupplierFareGbp: 450,
            differenceGbp: 50,
          },
          latestCheck: null,
        },
        {
          bookingId: SECOND_BOOKING_ID,
          initialSupplierFareGbp: 500,
          currentSupplierFareGbp: 500,
          latestAdjustment: null,
          latestCheck: null,
        },
      ],
    })
    expect(JSON.stringify(body)).not.toMatch(/sale|commission|profit|margin|earnings/i)
  })

  it('strictly validates exact filters and binds opaque cursors to them', async () => {
    mocks.state.bookings = {
      data: [
        bookingRow(),
        bookingRow({
          bookingId: SECOND_BOOKING_ID,
          rootTransactionId: SECOND_ROOT_TRANSACTION_ID,
        }),
      ],
      error: null,
    }
    const query = new URLSearchParams({
      pnr: 'abc 123',
      airline: 'tk',
      owner: OWNER_ID,
      departureFrom: '2026-09-01',
      departureTo: '2026-09-30',
      limit: '1',
    })
    const first = await GET(
      new NextRequest(`http://localhost/api/ticketing/fare-adjustments?${query}`),
    )
    const firstBody = await first.json()

    expect(first.status).toBe(200)
    expect(firstBody.hasMore).toBe(true)
    expect(firstBody.nextCursor).toEqual(expect.any(String))
    expect(mocks.bookingQuery.eq).toHaveBeenCalledWith('normalized_pnr', 'ABC123')
    expect(mocks.bookingQuery.eq).toHaveBeenCalledWith('airlines.iata_code', 'TK')
    expect(mocks.bookingQuery.eq).toHaveBeenCalledWith('owner_employee_id', OWNER_ID)
    expect(mocks.bookingQuery.gte).toHaveBeenCalledWith('departure_date', '2026-09-01')
    expect(mocks.bookingQuery.lte).toHaveBeenCalledWith('departure_date', '2026-09-30')
    expect(mocks.bookingQuery.limit).toHaveBeenCalledWith(2)

    mocks.state.bookings = { data: [bookingRow()], error: null }
    query.set('cursor', firstBody.nextCursor)
    const next = await GET(
      new NextRequest(`http://localhost/api/ticketing/fare-adjustments?${query}`),
    )
    expect(next.status).toBe(200)
    expect(mocks.bookingQuery.or).toHaveBeenCalledWith(
      expect.stringContaining(`id.lt.${BOOKING_ID}`),
    )

    query.set('airline', 'PK')
    expect(
      (await GET(new NextRequest(`http://localhost/api/ticketing/fare-adjustments?${query}`)))
        .status,
    ).toBe(400)
  })

  it.each([
    'unknown=value',
    'pnr=ABC123&pnr=DEF456',
    'airline=THY',
    'owner=not-a-uuid',
    'departureFrom=2026-09-31',
    'departureFrom=2026-09-30&departureTo=2026-09-01',
    'limit=0',
    'limit=101',
    'cursor=not-valid-json',
  ])('rejects an invalid or non-exact GET query: %s', async (query) => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/fare-adjustments?${query}`),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('fails closed when capability, booking data, or current-tail data is unavailable', async () => {
    mocks.state.capability = {
      data: { ready: true, version: 2026082304, requiredVersion: 2026082304 },
      error: null,
    }
    expect(
      (await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))).status,
    ).toBe(503)

    mocks.state.capability = {
      data: [{ ready: true, version: 2026083102, requiredVersion: 2026083102 }],
      error: null,
    }
    expect(
      (await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))).status,
    ).toBe(200)

    mocks.state.capability = {
      data: { ready: true, version: 2026083102, requiredVersion: 2026083102 },
      error: null,
    }
    mocks.state.bookings = { data: null, error: { message: 'query failed' } }
    expect(
      (await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))).status,
    ).toBe(500)

    mocks.state.bookings = { data: [bookingRow()], error: null }
    mocks.state.currentAdjustments = { data: null, error: { message: 'view failed' } }
    expect(
      (await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))).status,
    ).toBe(500)
  })

  it('rejects malformed or duplicate latest-tail projections instead of guessing', async () => {
    mocks.state.currentAdjustments = {
      data: [currentAdjustmentRow(), currentAdjustmentRow()],
      error: null,
    }
    expect(
      (await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))).status,
    ).toBe(500)

    mocks.state.currentAdjustments = {
      data: [{ ...currentAdjustmentRow(), difference_gbp: '49.99' }],
      error: null,
    }
    expect(
      (await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))).status,
    ).toBe(500)

    mocks.state.currentAdjustments = {
      data: [{ ...currentAdjustmentRow(), new_fare_source: '449.99' }],
      error: null,
    }
    expect(
      (await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))).status,
    ).toBe(500)
  })

  it('keeps immutable adjustment snapshots valid after later package and owner changes', async () => {
    mocks.state.currentAdjustments = {
      data: [
        {
          ...currentAdjustmentRow(),
          owner_employee_id: HISTORICAL_OWNER_ID,
          package_match_status: 'unmatched',
          commission_scope: 'ticket',
        },
      ],
      error: null,
    }

    const response = await GET(new NextRequest('http://localhost/api/ticketing/fare-adjustments'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items[0]).toMatchObject({
      bookingId: BOOKING_ID,
      packageMatchStatus: 'matched',
      owner: {
        employeeId: OWNER_ID,
        fullName: 'Other Ticketing Agent',
      },
      currentSupplierFareGbp: 450,
      latestAdjustment: {
        adjustmentId: ADJUSTMENT_ID,
        newSupplierFareGbp: 450,
      },
    })
  })

  it('enforces the per-user/IP mutation limit and 16 KiB strict public body', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Cache-Control': 'private, no-store' } },
      ),
    })
    expect((await POST(postRequest(validEntry()))).status).toBe(429)

    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 58,
      retryAfterSeconds: 0,
    })
    expect(
      (await POST(postRequest({ ...validEntry(), padding: 'x'.repeat(20 * 1024) }))).status,
    ).toBe(400)
    expect((await POST(postRequest({ ...validEntry(), actingEmployeeId: OWNER_ID }))).status).toBe(
      400,
    )
    expect((await POST(postRequest(validEntry(), null))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_append_fare_adjustment_commercial',
      expect.anything(),
    )
  })

  it('passes only the verified actor and mapped public entry to the atomic RPC', async () => {
    const response = await POST(postRequest(validEntry(), 'low-fare-save-1'))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.append-fare-adjustment',
        limit: 60,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_append_fare_adjustment_commercial', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_idempotency_key: 'low-fare-save-1',
      p_entry: {
        expectedBookingVersion: 4,
        expectedRootTransactionVersion: 7,
        expectedPreviousAdjustmentId: null,
        notes: 'Found lower fare',
        currency: 'GBP',
        newFareGbp: 450,
        effectiveOn: '2026-08-24',
      },
    })
    expect(body).toEqual({
      bookingId: BOOKING_ID,
      bookingVersion: 5,
      rootTransactionId: ROOT_TRANSACTION_ID,
      rootTransactionVersion: 7,
      adjustmentId: ADJUSTMENT_ID,
      previousAdjustmentId: null,
      sequenceNumber: 1,
      currency: 'GBP',
      originalSupplierFareGbp: 500,
      newSupplierFareGbp: 450,
      differenceGbp: 50,
      passengerCount: 2,
      effectiveDate: '2026-08-24',
      packageMatchStatus: 'matched',
      createdAt: '2026-08-24T13:00:00.000Z',
      idempotentReplay: false,
      staffFamilyReprice: null,
    })
    expect(JSON.stringify(body)).not.toMatch(
      /owner|actor|location|sale|commission|profit|margin|earnings|sourceEvent|auditEvent/i,
    )
  })

  it('returns an idempotent replay as 200 and accepts a server-validated higher fare', async () => {
    mocks.state.append = { data: appendResult({ replay: true }), error: null }
    expect((await POST(postRequest(validEntry()))).status).toBe(200)

    const higherEntry = { ...validEntry(), newSupplierFareGbp: 550 }
    mocks.state.append = { data: appendResult({ difference: -50 }), error: null }
    const higher = await POST(postRequest(higherEntry, 'higher-fare-1'))
    const body = await higher.json()

    expect(higher.status).toBe(201)
    expect(body).toMatchObject({
      newSupplierFareGbp: 550,
      differenceGbp: -50,
    })
  })

  it.each([
    {
      name: 'record missing',
      error: { code: 'P0002', hint: 'TICKETING_RECORD_NOT_FOUND' },
      status: 404,
      code: undefined,
    },
    {
      name: 'lineage conflict',
      error: {
        code: '23505',
        hint: 'TICKETING_FARE_ADJUSTMENT_LINEAGE_CONFLICT',
        details: JSON.stringify({
          currentPreviousAdjustmentId: ADJUSTMENT_ID,
          currentSequenceNumber: 2,
        }),
      },
      status: 409,
      code: 'LINEAGE_CONFLICT',
    },
    {
      name: 'version conflict',
      error: {
        code: '40001',
        hint: 'TICKETING_VERSION_CONFLICT',
        details: JSON.stringify({ bookingVersion: 8, rootTransactionVersion: 7 }),
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
      name: 'chronology',
      error: { code: '22023', hint: 'TICKETING_DATE_CONFLICT' },
      status: 400,
      code: 'DATE_CONFLICT',
    },
    {
      name: 'no fare change',
      error: { code: '22023', hint: 'TICKETING_ZERO_FARE_DIFFERENCE' },
      status: 400,
      code: 'ZERO_FARE_DIFFERENCE',
    },
    {
      name: 'correction required',
      error: { code: '55000', hint: 'TICKETING_CORRECTION_REQUIRED' },
      status: 409,
      code: 'CORRECTION_REQUIRED',
    },
    {
      name: 'forbidden',
      error: { code: '42501' },
      status: 403,
      code: undefined,
    },
  ])('maps the DB $name without exposing raw details', async ({ error, status, code }) => {
    mocks.state.append = { data: null, error }

    const response = await POST(postRequest(validEntry()))
    const body = await response.json()

    expect(response.status).toBe(status)
    if (code) expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toContain('TICKETING_')
  })

  it('fails closed on a stale capability or malformed RPC envelope', async () => {
    mocks.state.capability = {
      data: { ready: true, version: 2026082304, requiredVersion: 2026082304 },
      error: null,
    }
    expect((await POST(postRequest(validEntry()))).status).toBe(503)

    mocks.state.capability = {
      data: { ready: true, version: 2026083102, requiredVersion: 2026083102 },
      error: null,
    }
    mocks.state.append = {
      data: {
        ...appendResult(),
        sourceEvent: { ...appendResult().sourceEvent, eventType: 'ticket_issued' },
      },
      error: null,
    }
    expect((await POST(postRequest(validEntry()))).status).toBe(500)

    mocks.state.append = {
      data: {
        ...appendResult(),
        adjustment: { ...appendResult().adjustment, newFareSource: 449.99 },
      },
      error: null,
    }
    expect((await POST(postRequest(validEntry(), 'source-divergence-1'))).status).toBe(500)

    mocks.state.append = {
      data: {
        ...appendResult(),
        booking: { ...appendResult().booking, version: 6 },
      },
      error: null,
    }
    expect((await POST(postRequest(validEntry(), 'version-jump-1'))).status).toBe(500)
  })
})
