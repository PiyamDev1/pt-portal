import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const REFUND_ID = '80000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const state: Record<string, { data: unknown; error: unknown }> = {
    capability: { data: null, error: null },
    mutation: { data: null, error: null },
  }
  const rpc = vi.fn(async (name: string) => {
    if (name === 'ticketing_schema_status') return state.capability
    if (name === 'ticketing_append_refund_event_2026090201') return state.mutation
    throw new Error(`Unexpected RPC: ${name}`)
  })
  return {
    requireTicketingAccess,
    enforceRateLimit,
    state,
    rpc,
    getServiceSupabaseClient: vi.fn(() => ({ rpc })),
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

import { POST } from '@/app/api/ticketing/refunds/[refundId]/events/route'

function request(eventType = 'confirmed_correct') {
  return new NextRequest(`http://localhost/api/ticketing/refunds/${REFUND_ID}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'refund-confirm-1' },
    body: JSON.stringify({
      expectedVersion: 4,
      eventType,
      amountGbp: eventType === 'airline_recovery' ? 450 : null,
      eventDate: '2026-09-02',
      reference: 'SUP-123',
      notes: null,
      overrideReason: null,
    }),
  })
}

const context = { params: Promise.resolve({ refundId: REFUND_ID }) }

describe('POST /api/ticketing/refunds/[refundId]/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID, email: 'agent@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'agent@example.test',
        fullName: 'Agent One',
        role: 'Agent',
        departments: ['Ticketing'],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.state.capability = {
      data: { ready: true, version: 2026090201, requiredVersion: 2026090201 },
      error: null,
    }
    mocks.state.mutation = {
      data: {
        refundId: REFUND_ID,
        eventId: '90000000-0000-4000-8000-000000000001',
        status: 'settled',
        version: 5,
        actualCompanyResultGbp: 20,
        idempotentReplay: false,
      },
      error: null,
    }
  })

  it('lets the responsible agent ask the database to confirm a finalised Refund', async () => {
    const response = await POST(request(), context)

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('ticketing_append_refund_event_2026090201', {
      p_actor_employee_id: ACTOR_ID,
      p_refund_id: REFUND_ID,
      p_expected_version: 4,
      p_event_type: 'confirmed_correct',
      p_amount_gbp: null,
      p_event_date: '2026-09-02',
      p_reference: 'SUP-123',
      p_notes: null,
      p_override_reason: null,
      p_idempotency_key: 'refund-confirm-1',
    })
  })

  it('keeps non-confirmation settlement writes under database admin authorization', async () => {
    mocks.state.mutation = { data: null, error: { code: '42501' } }

    const response = await POST(request('airline_recovery'), context)

    expect(response.status).toBe(403)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'ticketing_append_refund_event_2026090201',
      expect.objectContaining({ p_event_type: 'airline_recovery' }),
    )
  })

  it('explains when supplier recovery is not ready for confirmation', async () => {
    mocks.state.mutation = {
      data: null,
      error: { code: '22023', hint: 'TICKETING_REFUND_CONFIRMATION_NOT_READY' },
    }

    const response = await POST(request(), context)

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/finalise the airline or supplier recovery/i)
  })

  it('does not allow a provisional Refund to be closed', async () => {
    mocks.state.mutation = {
      data: null,
      error: { code: '55000', hint: 'TICKETING_REFUND_CONFIRMATION_REQUIRED' },
    }

    const response = await POST(request(), context)

    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/confirm this refund is correct/i)
  })

  it.each([
    ['TICKETING_IDEMPOTENCY_CONFLICT', /save key was already used/i],
    ['TICKETING_REFUND_ALREADY_CONFIRMED', /already confirmed correct/i],
  ])('maps %s to a private conflict', async (hint, message) => {
    mocks.state.mutation = { data: null, error: { code: '22023', hint } }

    const response = await POST(request(), context)
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toMatch(message)
    expect(JSON.stringify(body)).not.toContain('TICKETING_')
  })
})
