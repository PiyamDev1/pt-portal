import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const BOOKING_ID = '60000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  requireTicketingAccess: vi.fn(),
  enforceRateLimit: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/ticketing/apiAuth', () => ({
  requireTicketingAccess: mocks.requireTicketingAccess,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '127.0.0.1',
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: () => ({ rpc: mocks.rpc }),
}))

import { POST } from '@/app/api/ticketing/ledger/[bookingId]/requests/route'

function request(body: unknown) {
  return new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ticketing/ledger/[bookingId]/requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      user: { id: 'user-1' },
      employee: { id: ACTOR_ID, role: 'Agent' },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'ticketing_schema_status'
        ? { data: { ready: true, version: 2026082802 }, error: null }
        : { data: { requestId: '70000000-0000-4000-8000-000000000001' }, error: null },
    )
  })

  it('allows a deletion request without a reason', async () => {
    const response = await POST(request({ requestType: 'deletion', requestNotes: null }), {
      params: Promise.resolve({ bookingId: BOOKING_ID }),
    })

    expect(response.status).toBe(201)
    expect(mocks.rpc).toHaveBeenLastCalledWith('ticketing_request_booking_change', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_request_type: 'deletion',
      p_request_notes: null,
    })
  })

  it('returns a normal success for an existing pending request', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'ticketing_schema_status'
        ? { data: { ready: true, version: 2026082802 }, error: null }
        : {
            data: {
              requestId: '70000000-0000-4000-8000-000000000001',
              idempotentReplay: true,
            },
            error: null,
          },
    )

    const response = await POST(request({ requestType: 'deletion', requestNotes: null }), {
      params: Promise.resolve({ bookingId: BOOKING_ID }),
    })

    expect(response.status).toBe(200)
  })

  it('requires the requested correction for an amendment', async () => {
    const response = await POST(request({ requestType: 'amendment', requestNotes: '' }), {
      params: Promise.resolve({ bookingId: BOOKING_ID }),
    })

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not expose database ownership denials', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'ticketing_schema_status'
        ? { data: { ready: true, version: 2026082802 }, error: null }
        : { data: null, error: { code: '42501' } },
    )
    const response = await POST(
      request({ requestType: 'amendment', requestNotes: 'Correct the sale price' }),
      { params: Promise.resolve({ bookingId: BOOKING_ID }) },
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'You cannot request a change to this ticket.' })
  })
})
