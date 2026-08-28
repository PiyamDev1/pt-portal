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

import { DELETE } from '@/app/api/ticketing/ledger/[bookingId]/archive/route'

function request(reason = 'Duplicate entry') {
  return new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}/archive`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
}

describe('DELETE /api/ticketing/ledger/[bookingId]/archive', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      user: { id: 'user-1' },
      employee: { id: ACTOR_ID },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'ticketing_schema_status'
        ? { data: { ready: true, version: 2026082801 }, error: null }
        : { data: { bookingId: BOOKING_ID, archived: true }, error: null },
    )
  })

  it('archives through the audited database boundary', async () => {
    const response = await DELETE(request(), { params: Promise.resolve({ bookingId: BOOKING_ID }) })

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('ticketing_archive_booking', {
      p_actor_employee_id: ACTOR_ID,
      p_booking_id: BOOKING_ID,
      p_reason: 'Duplicate entry',
    })
  })

  it('requires a reason', async () => {
    const response = await DELETE(request(''), {
      params: Promise.resolve({ bookingId: BOOKING_ID }),
    })

    expect(response.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not weaken database ownership denial', async () => {
    mocks.rpc.mockImplementation(async (name: string) =>
      name === 'ticketing_schema_status'
        ? { data: { ready: true, version: 2026082801 }, error: null }
        : { data: null, error: { code: '42501' } },
    )
    const response = await DELETE(request(), { params: Promise.resolve({ bookingId: BOOKING_ID }) })

    expect(response.status).toBe(403)
  })
})
