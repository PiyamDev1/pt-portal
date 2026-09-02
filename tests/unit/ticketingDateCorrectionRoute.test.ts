import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'
const TRANSACTION_ID = '81000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => ({
  requireTicketingAccess: vi.fn(),
  enforceRateLimit: vi.fn(),
  rpc: vi.fn(),
  getServiceSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/ticketing/apiAuth', () => ({
  requireTicketingAccess: mocks.requireTicketingAccess,
  canManageTicketingRecords: (role: string) =>
    ['maintenance admin', 'admin', 'master admin', 'super admin'].includes(
      role.trim().toLowerCase().replace(/[_-]+/g, ' '),
    ),
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '127.0.0.1',
}))

import { PATCH } from '@/app/api/ticketing/ledger/[bookingId]/dates/route'

function entry() {
  return {
    transactionId: TRANSACTION_ID,
    expectedBookingVersion: 4,
    expectedTransactionVersion: 7,
    operationalStatus: 'issued',
    bookingDate: '2026-09-01',
    timeLimitAt: null,
    issuedAt: '2026-09-02',
    reason: 'Corrected from the airline invoice',
  }
}

function request(body: unknown = entry(), key: string | null = 'date-correction-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers['Idempotency-Key'] = key
  return new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}/dates`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

const context = { params: Promise.resolve({ bookingId: BOOKING_ID }) }

describe('PATCH /api/ticketing/ledger/[bookingId]/dates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'team',
      user: { id: ACTOR_ID },
      employee: { id: ACTOR_ID, role: 'Admin', departments: [] },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'ticketing_schema_status') {
        return { data: { ready: true, version: 2026090204 }, error: null }
      }
      if (name === 'ticketing_correct_transaction_dates_2026090203') {
        return {
          data: {
            bookingId: BOOKING_ID,
            transactionId: TRANSACTION_ID,
            bookingVersion: 5,
            transactionVersion: 8,
            bookingDate: '2026-09-01',
            timeLimitAt: null,
            issuedAt: '2026-09-02',
            idempotentReplay: false,
          },
          error: null,
        }
      }
      throw new Error(`Unexpected RPC: ${name}`)
    })
    mocks.getServiceSupabaseClient.mockReturnValue({ rpc: mocks.rpc })
  })

  it('performs an audited date correction with server-derived actor identity', async () => {
    const response = await PATCH(request(), context)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_correct_transaction_dates_2026090203', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_transaction_id: TRANSACTION_ID,
      p_expected_booking_version: 4,
      p_expected_transaction_version: 7,
      p_idempotency_key: 'date-correction-1',
      p_correction: {
        operationalStatus: 'issued',
        bookingDate: '2026-09-01',
        timeLimitAt: null,
        issuedAt: '2026-09-02',
        reason: 'Corrected from the airline invoice',
      },
    })
  })

  it('allows Maintenance Admin but rejects ordinary Ticketing staff', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: true,
      scope: 'team',
      user: { id: ACTOR_ID },
      employee: { id: ACTOR_ID, role: 'Maintenance Admin', departments: [] },
    })
    expect((await PATCH(request(), context)).status).toBe(200)

    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID },
      employee: { id: ACTOR_ID, role: 'Agent', departments: ['Ticketing'] },
    })
    expect((await PATCH(request(), context)).status).toBe(403)
  })

  it('rejects invalid chronology and missing save keys before mutation', async () => {
    expect(
      (
        await PATCH(
          request({ ...entry(), bookingDate: '2026-09-03', issuedAt: '2026-09-02' }),
          context,
        )
      ).status,
    ).toBe(400)
    expect((await PATCH(request(entry(), null), context)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_correct_transaction_dates_2026090203',
      expect.anything(),
    )
  })

  it('accepts the retained deadline model for a cancellation before issuance', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'ticketing_schema_status') {
        return { data: { ready: true, version: 2026090204 }, error: null }
      }
      return {
        data: {
          bookingId: BOOKING_ID,
          transactionId: TRANSACTION_ID,
          bookingVersion: 5,
          transactionVersion: 8,
          bookingDate: '2026-09-01',
          timeLimitAt: '2026-09-02T16:00',
          issuedAt: null,
          idempotentReplay: false,
        },
        error: null,
      }
    })
    const response = await PATCH(
      request({
        ...entry(),
        operationalStatus: 'cancelled',
        timeLimitAt: '2026-09-02T16:00',
        issuedAt: null,
      }),
      context,
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'ticketing_correct_transaction_dates_2026090203',
      expect.objectContaining({
        p_correction: expect.objectContaining({
          operationalStatus: 'cancelled',
          timeLimitAt: '2026-09-02T16:00',
          issuedAt: null,
        }),
      }),
    )
  })

  it('fails closed on capability drift and maps optimistic conflicts', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 2026090202 },
      error: null,
    })
    expect((await PATCH(request(), context)).status).toBe(503)

    mocks.rpc
      .mockResolvedValueOnce({ data: { ready: true, version: 2026090204 }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: {
          code: '40001',
          hint: 'TICKETING_VERSION_CONFLICT',
          details: JSON.stringify({ bookingVersion: 6, transactionVersion: 9 }),
        },
      })
    const conflict = await PATCH(request(), context)
    expect(conflict.status).toBe(409)
    expect(await conflict.json()).toMatchObject({
      code: 'VERSION_CONFLICT',
      currentVersions: { bookingVersion: 6, transactionVersion: 9 },
    })
  })
})
