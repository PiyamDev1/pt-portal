import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const OWNER_ID = '40000000-0000-4000-8000-000000000002'
const FOLLOW_UP_ID = '40000000-0000-4000-8000-000000000003'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const VOUCHER_ID = '82000000-0000-4000-8000-000000000001'
const AIRLINE_ID = '50000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const state: {
    capability: { data: unknown; error: unknown }
    vouchers: { data: unknown; error: unknown }
    create: { data: unknown; error: any }
  } = {
    capability: { data: null, error: null },
    vouchers: { data: null, error: null },
    create: { data: null, error: null },
  }

  const voucherQuery: Record<string, any> = {}
  for (const method of ['select', 'eq', 'or', 'order', 'limit']) {
    voucherQuery[method] = vi.fn(() => voucherQuery)
  }
  voucherQuery.then = (
    onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => Promise.resolve(state.vouchers).then(onFulfilled, onRejected)

  const from = vi.fn((table: string) => {
    if (table === 'ticket_vouchers') return voucherQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'ticketing_schema_status') return state.capability
    if (functionName === 'ticketing_create_voucher_2026082901') return state.create
    throw new Error(`Unexpected RPC: ${functionName}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))

  return {
    requireTicketingAccess,
    enforceRateLimit,
    state,
    voucherQuery,
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

import { GET, POST } from '@/app/api/ticketing/vouchers/route'

function voucherRow() {
  return {
    id: VOUCHER_ID,
    booking_id: BOOKING_ID,
    pnr: 'ABC123',
    ticket_number: '1571234567890',
    passenger_name: 'Example Passenger',
    passenger_type: 'YTH',
    issue_date: '2026-08-01',
    cancellation_date: '2026-08-29',
    claim_by_date: '2027-07-01',
    status: 'unclaimed',
    confirmed_value_gbp: null,
    remaining_value_gbp: null,
    airline_reference: 'AIRLINE-REF-1',
    notes: 'Awaiting airline claim',
    version: 1,
    created_at: '2026-08-29T12:00:00.000Z',
    airlines: { id: AIRLINE_ID, iata_code: 'TK', name: 'Turkish Airlines' },
    owner_employee: { id: OWNER_ID, full_name: 'Responsible Agent' },
    follow_up_employee: { id: FOLLOW_UP_ID, full_name: 'Follow-up Agent' },
  }
}

function validEntry() {
  return {
    bookingId: BOOKING_ID,
    passengerType: 'YTH',
    passengerPosition: 1,
    followUpEmployeeId: FOLLOW_UP_ID,
    cancellationDate: '2026-08-29',
    claimByDate: null,
    airlineReference: ' AIRLINE-REF-1 ',
    notes: ' Awaiting airline claim ',
  }
}

function postRequest(body: unknown, idempotencyKey: string | null = 'voucher-create-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idempotencyKey !== null) headers['Idempotency-Key'] = idempotencyKey
  return new NextRequest('http://localhost/api/ticketing/vouchers', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('/api/ticketing/vouchers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID, email: 'agent@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'agent@example.test',
        fullName: 'Ticketing Agent',
        role: 'User',
        departments: ['Ticketing'],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 39,
      retryAfterSeconds: 0,
    })
    mocks.state.capability = {
      data: { ready: true, version: 2026082903, requiredVersion: 2026082903 },
      error: null,
    }
    mocks.state.vouchers = { data: [voucherRow()], error: null }
    mocks.state.create = {
      data: {
        voucherId: VOUCHER_ID,
        bookingId: BOOKING_ID,
        status: 'unclaimed',
        claimByDate: '2027-07-01',
        idempotentReplay: false,
      },
      error: null,
    }
  })

  it('authenticates before service-role access for both methods', async () => {
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    expect((await GET(new NextRequest('http://localhost/api/ticketing/vouchers'))).status).toBe(401)
    expect((await POST(postRequest(validEntry()))).status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('scopes regular staff to owned or assigned vouchers and maps no invented value', async () => {
    const response = await GET(
      new NextRequest(
        'http://localhost/api/ticketing/vouchers?pnr=ab%20c123&status=unclaimed&limit=25',
      ),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.voucherQuery.or).toHaveBeenCalledWith(
      `owner_employee_id.eq.${ACTOR_ID},follow_up_employee_id.eq.${ACTOR_ID}`,
    )
    expect(mocks.voucherQuery.eq).toHaveBeenCalledWith('pnr', 'ABC123')
    expect(mocks.voucherQuery.eq).toHaveBeenCalledWith('status', 'unclaimed')
    expect(mocks.voucherQuery.limit).toHaveBeenCalledWith(26)
    expect(body).toEqual({
      items: [
        expect.objectContaining({
          id: VOUCHER_ID,
          passengerType: 'YTH',
          confirmedValueGbp: null,
          remainingValueGbp: null,
          owner: { id: OWNER_ID, fullName: 'Responsible Agent' },
          followUpOwner: { id: FOLLOW_UP_ID, fullName: 'Follow-up Agent' },
        }),
      ],
      nextCursor: null,
      context: { canManage: false },
    })
  })

  it('allows administrators to read the team register without an owner predicate', async () => {
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

    expect((await GET(new NextRequest('http://localhost/api/ticketing/vouchers'))).status).toBe(200)
    expect(mocks.voucherQuery.or).not.toHaveBeenCalled()
  })

  it('fails closed for stale capability and malformed filters', async () => {
    const invalid = await GET(
      new NextRequest('http://localhost/api/ticketing/vouchers?status=unclaimed&status=closed'),
    )
    expect(invalid.status).toBe(400)
    expect(invalid.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()

    mocks.state.capability = {
      data: { ready: true, version: 2026082802, requiredVersion: 2026082802 },
      error: null,
    }
    const unavailable = await GET(new NextRequest('http://localhost/api/ticketing/vouchers'))
    expect(unavailable.status).toBe(503)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('creates through the atomic RPC using only the authenticated actor', async () => {
    const response = await POST(postRequest(validEntry(), 'voucher-retry-1'))

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.voucher-create',
        limit: 40,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_create_voucher_2026082901', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_passenger_type: 'YTH',
      p_passenger_position: 1,
      p_follow_up_employee_id: FOLLOW_UP_ID,
      p_cancellation_date: '2026-08-29',
      p_claim_by_date: null,
      p_airline_reference: 'AIRLINE-REF-1',
      p_notes: 'Awaiting airline claim',
      p_idempotency_key: 'voucher-retry-1',
    })
    expect(JSON.stringify(await response.json())).not.toMatch(
      /confirmedValue|remainingValue|profit/i,
    )
  })

  it('rejects loose bodies, missing retry keys, and rate-limited requests before mutation', async () => {
    expect((await POST(postRequest({ ...validEntry(), actorEmployeeId: OWNER_ID }))).status).toBe(
      400,
    )
    expect((await POST(postRequest(validEntry(), null))).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_create_voucher_2026082901',
      expect.anything(),
    )

    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
    })
    expect((await POST(postRequest(validEntry()))).status).toBe(429)
  })

  it.each([
    [{ code: '42501' }, 403],
    [{ code: '23505', hint: 'TICKETING_VOUCHER_EXISTS' }, 409],
    [{ code: 'P0002' }, 404],
    [{ code: '22023', message: 'sensitive database detail' }, 400],
    [{ code: 'XX000', message: 'sensitive database detail' }, 500],
  ])('maps mutation errors without exposing database detail', async (error, status) => {
    mocks.state.create = { data: null, error }
    const response = await POST(postRequest(validEntry()))
    expect(response.status).toBe(status)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(JSON.stringify(await response.json())).not.toContain('sensitive database detail')
  })
})
