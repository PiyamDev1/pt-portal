import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const OWNER_ID = '40000000-0000-4000-8000-000000000002'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const detailMaybeSingle = vi.fn()
  const detailQuery: Record<string, unknown> = {}
  const detailEq = vi.fn(() => detailQuery)
  const detailIs = vi.fn(() => detailQuery)
  Object.assign(detailQuery, { eq: detailEq, is: detailIs, maybeSingle: detailMaybeSingle })
  const detailSelect = vi.fn(() => detailQuery)
  const state: {
    capability: { data: unknown; error: unknown }
    completion: { data: unknown; error: unknown }
  } = {
    capability: { data: null, error: null },
    completion: { data: null, error: null },
  }
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'ticketing_schema_status') return state.capability
    if (functionName === 'ticketing_complete_tk_details_authorized') return state.completion
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
    detailEq,
    detailIs,
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

function detailRow(
  options: {
    complete?: boolean
    paid?: boolean
    ownerEmployeeId?: string
    ownerName?: string | null
  } = {},
) {
  const complete = options.complete === true
  const paid = options.paid === true
  const ownerEmployeeId = options.ownerEmployeeId || ACTOR_ID
  return {
    id: TRANSACTION_ID,
    version: 7,
    owner_employee_id: ownerEmployeeId,
    operational_status: 'issued',
    payment_status: paid ? 'paid' : 'unpaid',
    paid_at: paid ? '2026-08-21T23:00:00.000Z' : null,
    responsible_employee: {
      id: ownerEmployeeId,
      full_name: options.ownerName === undefined ? 'Ticketing Manager' : options.ownerName,
    },
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
      data: { ready: true, version: 2026082403, requiredVersion: 2026082403 },
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

  it("keeps a Manager's root-TK detail owner-only despite oversight team scope", async () => {
    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`),
      context(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.detailEq).toHaveBeenCalledWith('booking_id', BOOKING_ID)
    expect(mocks.detailEq).toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(mocks.detailEq).toHaveBeenCalledWith('service_type', 'TK')
    expect(body.detail).toMatchObject({
      bookingId: BOOKING_ID,
      transactionId: TRANSACTION_ID,
      bookingVersion: 4,
      transactionVersion: 7,
      detailsStatus: 'needs_details',
      responsibleEmployee: { id: ACTOR_ID, fullName: 'Ticketing Manager' },
    })
    expect(body.completionContext).toEqual({
      ownerEmployee: { id: ACTOR_ID, fullName: 'Ticketing Manager' },
      isOnBehalf: false,
      onBehalfReasonRequired: false,
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

  it('lets a canonical administrator load one non-owned root TK with DB-derived context', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: true,
      scope: 'team',
      user: { id: ACTOR_ID, email: 'admin@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'admin@example.test',
        fullName: 'Portal Admin',
        role: 'Master Admin',
        departments: [],
      },
    })
    mocks.detailMaybeSingle.mockResolvedValueOnce({
      data: detailRow({ ownerEmployeeId: OWNER_ID, ownerName: null }),
      error: null,
    })

    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`),
      context(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.detailEq).not.toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(body.detail.responsibleEmployee).toEqual({ id: OWNER_ID, fullName: 'Staff member' })
    expect(body.completionContext).toEqual({
      ownerEmployee: { id: OWNER_ID, fullName: 'Staff member' },
      isOnBehalf: true,
      onBehalfReasonRequired: true,
    })
  })

  it('keeps a Manager and regular staff owner-only for a non-owned root TK', async () => {
    mocks.detailMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const response = await GET(
      new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}`),
      context(),
    )

    expect(response.status).toBe(404)
    expect(mocks.detailEq).toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
  })

  it('does not grant Maintenance Admin non-owner completion access', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID, email: 'maintenance@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'maintenance@example.test',
        fullName: 'Maintenance Admin',
        role: 'Maintenance Admin',
        departments: ['Ticketing'],
      },
    })
    mocks.detailMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const response = await PATCH(
      patchRequest({
        ...validPatch(),
        onBehalfReason: 'Maintenance coverage is not authorised',
      }),
      context(),
    )

    expect(response.status).toBe(404)
    expect(mocks.detailEq).toHaveBeenCalledWith('owner_employee_id', ACTOR_ID)
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_complete_tk_details_authorized',
      expect.anything(),
    )
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
      data: { ready: true, version: 2026082402, requiredVersion: 2026082402 },
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
    mocks.detailMaybeSingle.mockResolvedValue({
      data: detailRow({ complete: true }),
      error: null,
    })

    const response = await PATCH(patchRequest(validPatch(), 'save-details-1'), context())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_complete_tk_details_authorized', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_idempotency_key: 'save-details-1',
      p_details: { ...validPatch(), onBehalfReason: null },
    })
    expect(body).toMatchObject({
      changed: true,
      idempotentReplay: false,
      detail: { bookingId: BOOKING_ID, detailsStatus: 'complete' },
      completionContext: {
        ownerEmployee: { id: ACTOR_ID, fullName: 'Ticketing Manager' },
        isOnBehalf: false,
        onBehalfReasonRequired: false,
      },
    })
    expect(JSON.stringify(body)).not.toMatch(/commission|profit/i)
  })

  it('requires a reason and preserves the real actor when an administrator completes for the owner', async () => {
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'team',
      user: { id: ACTOR_ID, email: 'admin@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'admin@example.test',
        fullName: 'Portal Admin',
        role: 'Super Admin',
        departments: [],
      },
    })
    mocks.detailMaybeSingle.mockResolvedValue({
      data: detailRow({ complete: true, ownerEmployeeId: OWNER_ID, ownerName: 'Agent One' }),
      error: null,
    })
    mocks.state.completion = {
      data: null,
      error: { code: '22023', hint: 'TICKETING_ON_BEHALF_REASON_REQUIRED' },
    }

    const missingReason = await PATCH(patchRequest(validPatch(), 'on-behalf-1'), context())
    const missingBody = await missingReason.json()

    expect(missingReason.status).toBe(400)
    expect(missingBody.code).toBe('ON_BEHALF_REASON_REQUIRED')
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_complete_tk_details_authorized', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_idempotency_key: 'on-behalf-1',
      p_details: { ...validPatch(), onBehalfReason: null },
    })

    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'team',
      user: { id: ACTOR_ID, email: 'admin@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'admin@example.test',
        fullName: 'Portal Admin',
        role: 'Admin',
        departments: [],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.state.capability = {
      data: { ready: true, version: 2026082403, requiredVersion: 2026082403 },
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
    mocks.detailMaybeSingle.mockResolvedValue({
      data: detailRow({ complete: true, ownerEmployeeId: OWNER_ID, ownerName: 'Agent One' }),
      error: null,
    })
    const onBehalfReason = 'Completed while Agent One was off sick'

    const response = await PATCH(
      patchRequest({ ...validPatch(), onBehalfReason }, 'on-behalf-2'),
      context(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_complete_tk_details_authorized', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_idempotency_key: 'on-behalf-2',
      p_details: { ...validPatch(), onBehalfReason },
    })
    expect(body.detail.responsibleEmployee).toEqual({ id: OWNER_ID, fullName: 'Agent One' })
    expect(body.completionContext).toEqual({
      ownerEmployee: { id: OWNER_ID, fullName: 'Agent One' },
      isOnBehalf: true,
      onBehalfReasonRequired: true,
    })
    expect(JSON.stringify(body)).not.toMatch(/commission|profit|audit|sourceEvents/i)
  })

  it('retries the exact committed payload after hydration failure and an ownership change', async () => {
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'team',
      user: { id: ACTOR_ID, email: 'admin@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'admin@example.test',
        fullName: 'Portal Admin',
        role: 'Admin',
        departments: [],
      },
    })
    const reason = 'Completed while Agent One was unavailable'
    const requestBody = { ...validPatch(), onBehalfReason: reason }
    mocks.detailMaybeSingle
      .mockResolvedValueOnce({
        data: detailRow({ complete: true, ownerEmployeeId: OWNER_ID, ownerName: 'Agent One' }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'post-commit hydration failed' },
      })
      .mockResolvedValueOnce({
        data: detailRow({ complete: true, ownerEmployeeId: ACTOR_ID, ownerName: 'Portal Admin' }),
        error: null,
      })
      .mockResolvedValueOnce({
        data: detailRow({ complete: true, ownerEmployeeId: ACTOR_ID, ownerName: 'Portal Admin' }),
        error: null,
      })

    const firstResponse = await PATCH(patchRequest(requestBody, 'commit-then-hydrate-1'), context())

    expect(firstResponse.status).toBe(500)
    expect(await firstResponse.json()).toEqual({
      error: 'Unable to reload the saved ticket details.',
    })

    mocks.state.completion = {
      data: {
        booking: { id: BOOKING_ID },
        transaction: { id: TRANSACTION_ID },
        changed: true,
        idempotentReplay: true,
      },
      error: null,
    }

    const retryResponse = await PATCH(patchRequest(requestBody, 'commit-then-hydrate-1'), context())
    const retryBody = await retryResponse.json()

    expect(retryResponse.status).toBe(200)
    expect(retryBody).toMatchObject({
      idempotentReplay: true,
      completionContext: {
        ownerEmployee: { id: ACTOR_ID, fullName: 'Portal Admin' },
        isOnBehalf: false,
        onBehalfReasonRequired: false,
      },
    })
    const completionCalls = mocks.rpc.mock.calls.filter(
      ([functionName]) => functionName === 'ticketing_complete_tk_details_authorized',
    )
    expect(completionCalls).toHaveLength(2)
    for (const [, parameters] of completionCalls) {
      expect(parameters).toMatchObject({
        p_actor_employee_id: ACTOR_ID,
        p_booking_id: BOOKING_ID,
        p_idempotency_key: 'commit-then-hydrate-1',
        p_details: requestBody,
      })
    }
  })

  it('keeps Manager completion owner-only and lets the DB reject a fresh owner reason', async () => {
    mocks.detailMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const hidden = await PATCH(
      patchRequest({ ...validPatch(), onBehalfReason: 'Not authorised' }),
      context(),
    )
    expect(hidden.status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_complete_tk_details_authorized',
      expect.anything(),
    )

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
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.state.capability = {
      data: { ready: true, version: 2026082403, requiredVersion: 2026082403 },
      error: null,
    }
    mocks.state.completion = {
      data: null,
      error: { code: '22023', hint: 'TICKETING_ON_BEHALF_REASON_NOT_ALLOWED' },
    }
    mocks.detailMaybeSingle.mockResolvedValue({ data: detailRow(), error: null })

    const ownerSave = await PATCH(
      patchRequest({ ...validPatch(), onBehalfReason: 'Fresh owner reason' }, 'owner-1'),
      context(),
    )

    expect(ownerSave.status).toBe(400)
    expect(await ownerSave.json()).toMatchObject({ code: 'ON_BEHALF_REASON_NOT_ALLOWED' })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'ticketing_complete_tk_details_authorized',
      expect.objectContaining({
        p_actor_employee_id: ACTOR_ID,
        p_details: { ...validPatch(), onBehalfReason: 'Fresh owner reason' },
      }),
    )
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
      name: 'attribution invariant correction',
      error: { code: '55000', hint: 'TICKETING_ATTRIBUTION_CORRECTION_REQUIRED' },
      status: 409,
      code: 'CORRECTION_REQUIRED',
    },
    {
      name: 'database on-behalf reason requirement',
      error: { code: '22023', hint: 'TICKETING_ON_BEHALF_REASON_REQUIRED' },
      status: 400,
      code: 'ON_BEHALF_REASON_REQUIRED',
    },
    {
      name: 'database owner reason rejection',
      error: { code: '22023', hint: 'TICKETING_ON_BEHALF_REASON_NOT_ALLOWED' },
      status: 400,
      code: 'ON_BEHALF_REASON_NOT_ALLOWED',
    },
    {
      name: 'non-admin on-behalf attempt',
      error: {
        code: '42501',
        hint: 'TICKETING_ON_BEHALF_FORBIDDEN',
        message: 'sensitive internal authorization detail',
      },
      status: 403,
      code: undefined,
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
    expect(JSON.stringify(body)).not.toContain('sensitive internal authorization detail')
    expect(mocks.detailMaybeSingle).toHaveBeenCalledTimes(1)
  })
})
