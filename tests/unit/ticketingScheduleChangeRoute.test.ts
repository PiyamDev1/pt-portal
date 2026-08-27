import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const SECTOR_ID = '89000000-0000-4000-8000-000000000001'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const CHANGE_ID = '88000000-0000-4000-8000-000000000001'
const EVENT_ID = '87000000-0000-4000-8000-000000000001'
const REQUEST_ID = '86000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  requireTicketingAccess: vi.fn(),
  enforceRateLimit: vi.fn(),
  rpc: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/ticketing/apiAuth', () => ({
  requireTicketingAccess: mocks.requireTicketingAccess,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '127.0.0.1',
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { POST } from '@/app/api/ticketing/flight-monitor/[sectorId]/schedule-change/route'

function request(body: unknown) {
  return new NextRequest(
    `http://localhost/api/ticketing/flight-monitor/${SECTOR_ID}/schedule-change`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
}

function context(sectorId = SECTOR_ID) {
  return { params: Promise.resolve({ sectorId }) }
}

function markBody() {
  return {
    requestId: REQUEST_ID,
    action: 'mark',
    expectedItineraryVersion: 2,
    changeId: null,
    proposal: {
      flightNumber: 'tk 201',
      departureLocal: '2026-09-01T12:30',
      arrivalLocal: null,
    },
    reason: ' Airline schedule email received ',
  }
}

function rpcResult() {
  return {
    action: 'mark',
    changeId: CHANGE_ID,
    eventId: EVENT_ID,
    bookingId: BOOKING_ID,
    priorSectorId: SECTOR_ID,
    sectorId: SECTOR_ID,
    itineraryVersion: 2,
    scheduleStatus: 'change_marked',
    ownerEmployeeId: '40000000-0000-4000-8000-000000000002',
    actingEmployeeId: ACTOR_ID,
    isOnBehalf: true,
    appliedSector: null,
    idempotentReplay: false,
  }
}

describe('POST /api/ticketing/flight-monitor/[sectorId]/schedule-change', () => {
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
        role: 'Ticketing Agent',
        departments: ['Ticketing'],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 39,
      retryAfterSeconds: 0,
    })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'ticketing_schema_status') {
        return { data: { ready: true, version: 2026082701 }, error: null }
      }
      if (name === 'ticketing_transition_schedule_change') {
        return { data: rpcResult(), error: null }
      }
      throw new Error(`Unexpected RPC: ${name}`)
    })
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc: mocks.rpc })
  })

  it('derives the actor from the staff session and returns the operational result', async () => {
    const response = await POST(request(markBody()), context())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body).toEqual(rpcResult())
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_transition_schedule_change', {
      p_actor_employee_id: ACTOR_ID,
      p_sector_id: SECTOR_ID,
      p_expected_itinerary_version: 2,
      p_idempotency_key: REQUEST_ID,
      p_action: 'mark',
      p_change_id: null,
      p_proposal: {
        flightNumber: 'TK 201',
        departureLocal: '2026-09-01T12:30',
        arrivalLocal: null,
      },
      p_reason: 'Airline schedule email received',
    })
    expect(JSON.stringify(body)).not.toMatch(/fare|sale|payment|profit|commission|margin/i)
  })

  it('rejects malformed action combinations before service-role access', async () => {
    for (const body of [
      { ...markBody(), action: 'review', changeId: null, proposal: null },
      { ...markBody(), action: 'review', changeId: CHANGE_ID },
      { ...markBody(), changeId: CHANGE_ID },
      { ...markBody(), reason: '' },
      { ...markBody(), actorEmployeeId: ACTOR_ID },
    ]) {
      expect((await POST(request(body), context())).status).toBe(400)
    }
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('fails closed for an invalid path, missing capability, and invalid RPC result', async () => {
    expect((await POST(request(markBody()), context('not-a-uuid'))).status).toBe(404)

    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 2026082602 },
      error: null,
    })
    expect((await POST(request(markBody()), context())).status).toBe(503)

    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 2026082701 },
      error: null,
    })
    mocks.rpc.mockResolvedValueOnce({ data: { action: 'mark' }, error: null })
    expect((await POST(request(markBody()), context())).status).toBe(500)
  })

  it('maps version, permission, unchanged, and local-time database failures safely', async () => {
    const cases = [
      [{ code: '40001', hint: 'TICKETING_ITINERARY_VERSION_CONFLICT' }, 409],
      [{ code: '42501', hint: 'TICKETING_SCHEDULE_ON_BEHALF_FORBIDDEN' }, 403],
      [{ code: '22023', hint: 'TICKETING_SCHEDULE_UNCHANGED' }, 400],
      [{ code: '22023', hint: 'TICKETING_LOCAL_TIME_GAP' }, 400],
    ] as const

    for (const [error, expectedStatus] of cases) {
      mocks.rpc.mockResolvedValueOnce({
        data: { ready: true, version: 2026082701 },
        error: null,
      })
      mocks.rpc.mockResolvedValueOnce({ data: null, error })
      const response = await POST(request(markBody()), context())
      expect(response.status).toBe(expectedStatus)
      expect(JSON.stringify(await response.json())).not.toContain('private data')
    }
  })

  it('authenticates and rate-limits before service-role mutation access', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    expect((await POST(request(markBody()), context())).status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()

    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
    })
    expect((await POST(request(markBody()), context())).status).toBe(429)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
