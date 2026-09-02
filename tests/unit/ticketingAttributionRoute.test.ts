import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'
const PRIMARY_ID = '40000000-0000-4000-8000-000000000002'
const ASSISTANT_ID = '40000000-0000-4000-8000-000000000003'
const BOOKING_ID = '80000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const state: {
    capability: { data: unknown; error: unknown }
    correction: { data: unknown; error: unknown }
  } = {
    capability: { data: null, error: null },
    correction: { data: null, error: null },
  }
  const rpc = vi.fn(async (functionName: string) => {
    if (functionName === 'ticketing_schema_status') return state.capability
    if (functionName === 'ticketing_correct_booking_attribution_commercial_2026090201') {
      return state.correction
    }
    throw new Error(`Unexpected RPC: ${functionName}`)
  })
  const employeeIn = vi.fn()
  const employeeSelect = vi.fn(() => ({ in: employeeIn }))
  const from = vi.fn((table: string) => {
    if (table === 'employees') return { select: employeeSelect }
    throw new Error(`Unexpected table: ${table}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))
  return {
    requireTicketingAccess,
    enforceRateLimit,
    state,
    rpc,
    employeeIn,
    employeeSelect,
    from,
    getServiceSupabaseClient,
  }
})

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

import { PATCH } from '@/app/api/ticketing/ledger/[bookingId]/attribution/route'

function validEntry() {
  return {
    expectedBookingVersion: 4,
    responsibleEmployeeId: PRIMARY_ID,
    assistantEmployeeIds: [ASSISTANT_ID],
    commercialTreatment: 'standard' as const,
    commissionWaiverReason: null,
    reason: 'Corrected after the administrator covered this ticket',
  }
}

function request(body: unknown, idempotencyKey: string | null = 'correct-attribution-1') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (idempotencyKey !== null) headers['Idempotency-Key'] = idempotencyKey
  return new NextRequest(`http://localhost/api/ticketing/ledger/${BOOKING_ID}/attribution`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

function context(bookingId = BOOKING_ID) {
  return { params: Promise.resolve({ bookingId }) }
}

function correctionResult(idempotentReplay = false) {
  return {
    bookingId: BOOKING_ID,
    bookingVersion: 5,
    attribution: {
      version: 2,
      primaryEmployeeId: PRIMARY_ID,
      enteredByEmployeeId: ACTOR_ID,
      changedByEmployeeId: ACTOR_ID,
      assistantEmployeeIds: [ASSISTANT_ID],
      reason: validEntry().reason,
    },
    auditEventId: '90000000-0000-4000-8000-000000000001',
    sourceEventCorrections: 1,
    commercialTreatment: validEntry().commercialTreatment,
    commissionWaiverReason: validEntry().commissionWaiverReason,
    idempotentReplay,
  }
}

describe('PATCH /api/ticketing/ledger/[bookingId]/attribution', () => {
  beforeEach(() => {
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
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 29,
      retryAfterSeconds: 0,
    })
    mocks.state.capability = {
      data: { ready: true, version: 2026090202, requiredVersion: 2026090202 },
      error: null,
    }
    mocks.state.correction = { data: correctionResult(), error: null }
    mocks.employeeIn.mockResolvedValue({
      data: [
        { id: PRIMARY_ID, full_name: 'Responsible Agent' },
        { id: ASSISTANT_ID, full_name: 'Assisting Manager' },
      ],
      error: null,
    })
  })

  it('authenticates and checks the canonical admin role before service access', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    expect((await PATCH(request(validEntry()), context())).status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()

    mocks.requireTicketingAccess.mockResolvedValueOnce({
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

    expect((await PATCH(request(validEntry()), context())).status).toBe(403)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('allows Maintenance Admin to perform audited staff corrections', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: true,
      scope: 'team',
      user: { id: ACTOR_ID, email: 'maintenance@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'maintenance@example.test',
        fullName: 'Maintenance Admin',
        role: 'Maintenance Admin',
        departments: [],
      },
    })

    const response = await PATCH(request(validEntry(), 'maintenance-correction-1'), context())

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'ticketing_correct_booking_attribution_commercial_2026090201',
      expect.objectContaining({ p_actor_employee_id: ACTOR_ID }),
    )
  })

  it('rejects invalid paths, loose bodies, and missing retry keys before the RPC', async () => {
    expect((await PATCH(request(validEntry()), context('not-a-uuid'))).status).toBe(404)
    expect(
      (await PATCH(request({ ...validEntry(), actingEmployeeId: ACTOR_ID }), context())).status,
    ).toBe(400)
    expect((await PATCH(request(validEntry(), null), context())).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('passes only the verified actor, path booking, retry key, version, and strict correction', async () => {
    const response = await PATCH(request(validEntry(), 'admin-correction-1'), context())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.correct-attribution',
        limit: 30,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.rpc).toHaveBeenCalledWith(
      'ticketing_correct_booking_attribution_commercial_2026090201',
      {
        p_actor_employee_id: ACTOR_ID,
        p_booking_id: BOOKING_ID,
        p_expected_booking_version: 4,
        p_idempotency_key: 'admin-correction-1',
        p_correction: {
          responsibleEmployeeId: PRIMARY_ID,
          assistantEmployeeIds: [ASSISTANT_ID],
          commercialTreatment: 'standard',
          commissionWaiverReason: null,
          reason: validEntry().reason,
        },
      },
    )
    expect(mocks.employeeIn).toHaveBeenCalledWith('id', [PRIMARY_ID, ASSISTANT_ID])
    expect(body).toEqual({
      bookingId: BOOKING_ID,
      bookingVersion: 5,
      attributionVersion: 2,
      responsibleEmployee: { id: PRIMARY_ID, fullName: 'Responsible Agent' },
      assistantEmployees: [{ id: ASSISTANT_ID, fullName: 'Assisting Manager' }],
      idempotentReplay: false,
    })
    expect(JSON.stringify(body)).not.toMatch(/audit|sourceEvent|commission|profit|earnings/i)
  })

  it('fails closed when capability or selected employees are unavailable', async () => {
    mocks.state.capability = {
      data: { ready: true, version: 2026083102, requiredVersion: 2026083102 },
      error: null,
    }
    expect((await PATCH(request(validEntry()), context())).status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'ticketing_correct_booking_attribution_commercial_2026090201',
      expect.anything(),
    )

    mocks.state.capability = {
      data: [{ ready: true, version: 2026090202, requiredVersion: 2026090202 }],
      error: null,
    }
    const singletonResponse = await PATCH(request(validEntry(), 'singleton-capability'), context())
    expect(singletonResponse.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith(
      'ticketing_correct_booking_attribution_commercial_2026090201',
      expect.anything(),
    )

    mocks.state.capability = {
      data: { ready: true, version: 2026090202, requiredVersion: 2026090202 },
      error: null,
    }
    mocks.employeeIn.mockResolvedValueOnce({
      data: [
        { id: PRIMARY_ID, full_name: null },
        { id: ASSISTANT_ID, full_name: 'Assisting Manager' },
      ],
      error: null,
    })

    const blankNameResponse = await PATCH(request(validEntry()), context())
    expect(blankNameResponse.status).toBe(200)
    expect(await blankNameResponse.json()).toMatchObject({
      responsibleEmployee: { id: PRIMARY_ID, fullName: 'Staff member' },
    })

    mocks.employeeIn.mockResolvedValueOnce({ data: [], error: null })
    expect((await PATCH(request(validEntry()), context())).status).toBe(400)

    mocks.employeeIn.mockResolvedValueOnce({ data: null, error: { message: 'query failed' } })
    expect((await PATCH(request(validEntry()), context())).status).toBe(500)
  })

  it('fails closed when the RPC does not return the requested commission treatment', async () => {
    mocks.state.correction = {
      data: { ...correctionResult(), commercialTreatment: 'commission_waived' },
      error: null,
    }

    const response = await PATCH(request(validEntry()), context())

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'Ticketing returned an invalid attribution result.',
    })
  })

  it.each([
    {
      name: 'missing record',
      error: { code: 'P0002', hint: 'TICKETING_RECORD_NOT_FOUND' },
      status: 404,
      code: undefined,
    },
    {
      name: 'version conflict',
      error: {
        code: '40001',
        hint: 'TICKETING_VERSION_CONFLICT',
        details: JSON.stringify({ bookingVersion: 8 }),
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
      name: 'inactive employee',
      error: { code: '22023', message: 'Responsible employee is invalid or inactive' },
      status: 400,
      code: 'INVALID_ATTRIBUTION_EMPLOYEE',
    },
    {
      name: 'unchanged attribution',
      error: { code: '22023', hint: 'TICKETING_ATTRIBUTION_NO_CHANGE' },
      status: 409,
      code: 'ATTRIBUTION_NO_CHANGE',
    },
    {
      name: 'missing correction reason',
      error: { code: '22023', hint: 'TICKETING_ATTRIBUTION_REASON_REQUIRED' },
      status: 400,
      code: 'ATTRIBUTION_REASON_REQUIRED',
    },
    {
      name: 'database authorization',
      error: { code: '42501', message: 'sensitive internal detail' },
      status: 403,
      code: undefined,
    },
  ])('maps $name without leaking database details', async ({ error, status, code }) => {
    mocks.state.correction = { data: null, error }

    const response = await PATCH(request(validEntry()), context())
    const body = await response.json()

    expect(response.status).toBe(status)
    if (code) expect(body.code).toBe(code)
    expect(JSON.stringify(body)).not.toContain('sensitive internal detail')
    expect(mocks.employeeIn).toHaveBeenCalledWith('id', [PRIMARY_ID, ASSISTANT_ID])
  })
})
