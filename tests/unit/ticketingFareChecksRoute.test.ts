import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const ROOT_ID = '81000000-0000-4000-8000-000000000001'
const CHECK_ID = '82000000-0000-4000-8000-000000000001'

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

import { POST } from '@/app/api/ticketing/fare-checks/route'

function body() {
  return {
    bookingId: BOOKING_ID,
    expectedBookingVersion: 4,
    expectedRootTransactionVersion: 7,
    expectedPreviousAdjustmentId: null,
    effectiveDate: '2026-08-29',
    notes: 'Supplier confirmed the same fare',
  }
}

function request(input: unknown = body(), key: string | null = 'fare-check-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key !== null) headers['Idempotency-Key'] = key
  return new NextRequest('http://localhost/api/ticketing/fare-checks', {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  })
}

describe('POST /api/ticketing/fare-checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      user: { id: ACTOR_ID },
      employee: { id: ACTOR_ID, role: 'User', departments: ['Ticketing'] },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'ticketing_schema_status') {
        return { data: { ready: true, version: 2026082904 }, error: null }
      }
      if (name === 'ticketing_record_fare_check_2026082904') {
        return {
          data: {
            checkId: CHECK_ID,
            bookingId: BOOKING_ID,
            bookingVersion: 4,
            rootTransactionId: ROOT_ID,
            rootTransactionVersion: 7,
            observedFareGbp: '420.00',
            effectiveDate: '2026-08-29',
            packageMatchStatus: 'unmatched',
            createdAt: '2026-08-29T12:00:00.000Z',
            idempotentReplay: false,
          },
          error: null,
        }
      }
      throw new Error(`Unexpected RPC: ${name}`)
    })
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc: mocks.rpc })
  })

  it('derives the actor from auth and records an operational no-change observation', async () => {
    const response = await POST(request())
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(result).toMatchObject({ checkId: CHECK_ID, observedFareGbp: 420 })
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_record_fare_check_2026082904', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_expected_booking_version: 4,
      p_expected_root_transaction_version: 7,
      p_expected_previous_adjustment_id: null,
      p_effective_on: '2026-08-29',
      p_notes: 'Supplier confirmed the same fare',
      p_idempotency_key: 'fare-check-1',
    })
    expect(JSON.stringify(result)).not.toMatch(/commission|profit|sale/i)
  })

  it('authenticates first and rejects malformed public input or missing save keys', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })
    expect((await POST(request())).status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()

    expect((await POST(request({ ...body(), actingEmployeeId: ACTOR_ID }))).status).toBe(400)
    expect((await POST(request(body(), null))).status).toBe(400)
  })

  it('fails closed on missing capability and maps concurrency conflicts', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 2026082903 },
      error: null,
    })
    expect((await POST(request())).status).toBe(503)

    mocks.rpc
      .mockResolvedValueOnce({ data: { ready: true, version: 2026082904 }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { code: '40001', hint: 'TICKETING_VERSION_CONFLICT' },
      })
    const conflict = await POST(request())
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({ code: 'VERSION_CONFLICT' })
  })
})
