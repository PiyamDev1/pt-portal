import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()

  const transactionLimit = vi.fn()
  const transactionOrder = vi.fn(() => ({ limit: transactionLimit }))
  const transactionIs = vi.fn(() => ({ order: transactionOrder }))
  const transactionEq = vi.fn(() => ({ is: transactionIs }))
  const transactionSelect = vi.fn(() => ({ eq: transactionEq }))

  const airlineOrder = vi.fn()
  const airlineEq = vi.fn(() => ({ order: airlineOrder }))
  const airlineSelect = vi.fn(() => ({ eq: airlineEq }))

  const employeeMaybeSingle = vi.fn()
  const employeeEq = vi.fn(() => ({ maybeSingle: employeeMaybeSingle }))
  const employeeSelect = vi.fn(() => ({ eq: employeeEq }))

  const rpc = vi.fn()
  const from = vi.fn((table: string) => {
    if (table === 'ticket_transactions') return { select: transactionSelect }
    if (table === 'airlines') return { select: airlineSelect }
    if (table === 'employees') return { select: employeeSelect }
    throw new Error(`Unexpected table: ${table}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))

  return {
    requireTicketingAccess,
    enforceRateLimit,
    transactionLimit,
    transactionOrder,
    transactionIs,
    transactionEq,
    transactionSelect,
    airlineOrder,
    airlineEq,
    airlineSelect,
    employeeMaybeSingle,
    employeeEq,
    employeeSelect,
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

import { GET, POST } from '@/app/api/ticketing/ledger/route'

function postRequest(body: unknown, idempotencyKey = 'quick-tk-1') {
  return new NextRequest('http://localhost/api/ticketing/ledger', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(body),
  })
}

function validEntry() {
  return {
    customerName: 'Test Passenger',
    pnr: 'ABC123',
    airlineId: AIRLINE_ID,
    serviceType: 'TK',
    operationalStatus: 'held',
    bookingDate: '2026-08-22',
    timeLimitAt: '2026-08-23T18:00',
    issuedAt: null,
    currency: 'GBP',
    fares: [{ passengerType: 'ADT', quantity: 1, unitSupplierCost: 400 }],
  }
}

describe('/api/ticketing/ledger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID, email: 'agent@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'agent@example.test',
        fullName: 'Ticket Agent',
        role: 'Agent',
        departments: ['Ticketing'],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 89,
      retryAfterSeconds: 0,
    })
    mocks.transactionLimit.mockResolvedValue({ data: [], error: null })
    mocks.airlineOrder.mockResolvedValue({
      data: [{ id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' }],
      error: null,
    })
    mocks.employeeMaybeSingle.mockResolvedValue({
      data: {
        locations: { name: 'London', branch_code: 'LON', timezone: 'Europe/London' },
      },
      error: null,
    })
    mocks.rpc.mockImplementation(async (functionName: string) => {
      if (functionName === 'ticketing_schema_status') {
        return {
          data: { ready: true, version: 2026082201, requiredVersion: 2026082201 },
          error: null,
        }
      }

      return {
        data: {
          booking: { id: 'booking-1', operationalStatus: 'held', paymentStatus: 'unpaid' },
          transaction: {
            id: 'transaction-1',
            serviceType: 'TK',
            operationalStatus: 'held',
            paymentStatus: 'unpaid',
            passengerTicketCount: 1,
          },
          packageMatch: { status: 'unmatched' },
          idempotentReplay: false,
        },
        error: null,
      }
    })
  })

  it('stops before service-role access when the caller is unauthorized', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(new NextRequest('http://localhost/api/ticketing/ledger'))

    expect(response.status).toBe(401)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('binds the ledger list to the authenticated owner and maps the operational DTO', async () => {
    mocks.transactionLimit.mockResolvedValueOnce({
      data: [
        {
          id: 'transaction-1',
          booking_id: 'booking-1',
          service_type: 'TK',
          operational_status: 'held',
          payment_status: 'unpaid',
          booking_date: '2026-08-22',
          time_limit_at: '2026-08-23T17:00:00Z',
          issued_at: null,
          passenger_ticket_count: 0,
          created_at: '2026-08-22T12:00:00Z',
          ticket_bookings: {
            id: 'booking-1',
            pnr: 'ABC123',
            customer_name: 'Test Passenger',
            package_match_status: 'unmatched',
            commission_scope: 'ticket',
            archived_at: null,
            airlines: { id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' },
          },
          ticket_passenger_fare_lines: [
            {
              passenger_type: 'ADT',
              quantity: 1,
              unit_supplier_cost_source: 400,
              unit_sale_price_source: null,
            },
          ],
        },
      ],
      error: null,
    })

    const response = await GET(new NextRequest('http://localhost/api/ticketing/ledger?limit=25'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.transactionEq).toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(mocks.transactionLimit).toHaveBeenCalledWith(25)
    expect(body.items).toEqual([
      expect.objectContaining({
        bookingId: 'booking-1',
        transactionId: 'transaction-1',
        customerName: 'Test Passenger',
        pnr: 'ABC123',
        passengerCount: 0,
      }),
    ])
    expect(body).not.toHaveProperty('commission')
    expect(body).not.toHaveProperty('profit')
  })

  it('fails closed when the quick-entry database capability is missing', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 20260822, requiredVersion: 20260822 },
      error: null,
    })

    const response = await GET(new NextRequest('http://localhost/api/ticketing/ledger'))

    expect(response.status).toBe(503)
    expect(mocks.transactionSelect).not.toHaveBeenCalled()
  })

  it('rejects caller-supplied employee identity instead of forwarding it', async () => {
    const response = await POST(postRequest({ ...validEntry(), ownerEmployeeId: 'other-agent' }))

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects an issued date before the booking date', async () => {
    const response = await POST(
      postRequest({
        ...validEntry(),
        operationalStatus: 'issued',
        timeLimitAt: null,
        bookingDate: '2026-08-22',
        issuedAt: '2026-08-21',
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects a held time limit before the booking date', async () => {
    const response = await POST(
      postRequest({
        ...validEntry(),
        bookingDate: '2026-08-22',
        timeLimitAt: '2026-08-21T18:00',
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects an aggregate passenger count above the quick-entry limit', async () => {
    const response = await POST(
      postRequest({
        ...validEntry(),
        fares: [
          { passengerType: 'ADT', quantity: 99, unitSupplierCost: 400 },
          { passengerType: 'CHD', quantity: 1, unitSupplierCost: 300 },
        ],
      }),
    )

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('passes the verified actor and retry key to one atomic quick-TK RPC', async () => {
    const response = await POST(postRequest(validEntry(), 'save-click-1'))
    const body = await response.json()

    expect(response.status).toBe(201)
    expect(body.bookingId).toBe('booking-1')
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_create_quick_tk', {
      p_actor_employee_id: ACTOR_ID,
      p_idempotency_key: 'save-click-1',
      p_entry: expect.objectContaining({
        customerName: 'Test Passenger',
        serviceType: 'TK',
        confirmDuplicate: false,
      }),
    })
  })

  it('turns the atomic duplicate check into a blocking confirmation response', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { ready: true, version: 2026082201, requiredVersion: 2026082201 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505',
          message: 'Duplicate TK confirmation required',
          hint: 'TICKETING_DUPLICATE_TK',
          details: JSON.stringify({
            bookingId: 'existing-booking',
            pnr: 'ABC123',
            customerName: 'Existing Passenger',
            ownedByActor: true,
          }),
        },
      })

    const response = await POST(postRequest(validEntry()))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body).toEqual({
      error: 'A TK record already exists for this airline and PNR.',
      code: 'DUPLICATE_TK',
      existing: {
        bookingId: 'existing-booking',
        pnr: 'ABC123',
        customerName: 'Existing Passenger',
        ownedByActor: true,
      },
    })
  })

  it('does not disclose another agent customer through a duplicate response', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { ready: true, version: 2026082201, requiredVersion: 2026082201 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '23505',
          message: 'Duplicate TK confirmation required',
          hint: 'TICKETING_DUPLICATE_TK',
          details: JSON.stringify({
            bookingId: 'other-agent-booking',
            pnr: 'ABC123',
            customerName: 'Private Customer',
            ownedByActor: false,
          }),
        },
      })

    const response = await POST(postRequest(validEntry()))
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.existing).toEqual({
      bookingId: '',
      pnr: 'ABC123',
      customerName: '',
      ownedByActor: false,
    })
  })

  it('returns a client error when an airline became inactive after the ledger loaded', async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { ready: true, version: 2026082201, requiredVersion: 2026082201 },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { code: 'P0002', message: 'Active airline not found' },
      })

    const response = await POST(postRequest(validEntry()))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Active airline not found')
  })
})
