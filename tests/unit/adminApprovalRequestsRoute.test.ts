import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireMaintenanceSession = vi.fn()
  const requireAdminSession = vi.fn()
  const enforceRateLimit = vi.fn()
  const getClientIp = vi.fn(() => '203.0.113.22')
  const targetMaybeSingle = vi.fn()
  const managerMaybeSingle = vi.fn()
  const roleMaybeSingle = vi.fn()
  const locationMaybeSingle = vi.fn()
  const membershipsEq = vi.fn()
  const departmentsIn = vi.fn()
  const insertSingle = vi.fn()
  const queueInsert = vi.fn(() => ({ select: () => ({ single: insertSingle }) }))
  const rpc = vi.fn()
  const listEq = vi.fn()

  const listQuery: Record<string, unknown> = {
    data: [],
    error: null,
    order: vi.fn(),
    limit: vi.fn(),
    eq: listEq,
  }
  ;(listQuery.order as ReturnType<typeof vi.fn>).mockReturnValue(listQuery)
  ;(listQuery.limit as ReturnType<typeof vi.fn>).mockReturnValue(listQuery)
  listEq.mockReturnValue(listQuery)

  const from = vi.fn((table: string) => {
    if (table === 'employees') {
      return {
        select: (columns: string) => ({
          eq: () => ({
            maybeSingle: columns.includes('full_name') ? targetMaybeSingle : managerMaybeSingle,
          }),
        }),
      }
    }
    if (table === 'employee_departments') {
      return { select: () => ({ eq: membershipsEq }) }
    }
    if (table === 'roles') {
      return { select: () => ({ eq: () => ({ maybeSingle: roleMaybeSingle }) }) }
    }
    if (table === 'departments') {
      return { select: () => ({ in: departmentsIn }) }
    }
    if (table === 'locations') {
      return { select: () => ({ eq: () => ({ maybeSingle: locationMaybeSingle }) }) }
    }
    if (table === 'staff_admin_approval_requests') {
      return {
        select: () => listQuery,
        insert: queueInsert,
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))
  return {
    requireMaintenanceSession,
    requireAdminSession,
    enforceRateLimit,
    getClientIp,
    targetMaybeSingle,
    managerMaybeSingle,
    roleMaybeSingle,
    locationMaybeSingle,
    membershipsEq,
    departmentsIn,
    insertSingle,
    queueInsert,
    rpc,
    listEq,
    listQuery,
    from,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireMaintenanceSession: mocks.requireMaintenanceSession,
  requireAdminSession: mocks.requireAdminSession,
}))

vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: mocks.getClientIp,
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { GET, PATCH, POST } from '@/app/api/admin/approval-requests/route'

const ACTOR_ID = '10000000-0000-4000-8000-000000000001'
const TARGET_ID = '10000000-0000-4000-8000-000000000002'
const ROLE_ID = '20000000-0000-4000-8000-000000000001'
const DEPARTMENT_ID = '30000000-0000-4000-8000-000000000001'
const LOCATION_ID = '40000000-0000-4000-8000-000000000001'
const REQUEST_ID = '50000000-0000-4000-8000-000000000001'

const proposal = {
  target_employee_id: TARGET_ID,
  proposed_full_name: 'Corrected Employee',
  proposed_role_id: ROLE_ID,
  proposed_department_ids: [DEPARTMENT_ID],
  proposed_location_id: LOCATION_ID,
  proposed_manager_id: null,
  request_reason: 'Correct the employee role and branch assignment.',
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown) {
  return new Request('http://localhost/api/admin/approval-requests', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function session(role: string) {
  return {
    authorized: true,
    user: { id: ACTOR_ID, email: 'actor@example.com' },
    employee: {
      id: ACTOR_ID,
      email: 'actor@example.com',
      fullName: 'Actor',
      role,
      departments: [],
    },
  }
}

describe('/api/admin/approval-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireMaintenanceSession.mockResolvedValue(session('Maintenance Admin'))
    mocks.requireAdminSession.mockResolvedValue(session('Admin'))
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    Object.assign(mocks.listQuery, { data: [], error: null })
    mocks.targetMaybeSingle.mockResolvedValue({
      data: {
        id: TARGET_ID,
        full_name: 'Old Employee',
        role_id: ROLE_ID,
        location_id: null,
        manager_id: null,
      },
      error: null,
    })
    mocks.membershipsEq.mockResolvedValue({
      data: [{ department_id: DEPARTMENT_ID }],
      error: null,
    })
    mocks.roleMaybeSingle.mockResolvedValue({ data: { id: ROLE_ID }, error: null })
    mocks.departmentsIn.mockResolvedValue({ data: [{ id: DEPARTMENT_ID }], error: null })
    mocks.locationMaybeSingle.mockResolvedValue({ data: { id: LOCATION_ID }, error: null })
    mocks.managerMaybeSingle.mockResolvedValue({ data: { id: ACTOR_ID }, error: null })
    mocks.insertSingle.mockResolvedValue({
      data: { id: REQUEST_ID, status: 'pending', created_at: '2026-09-02T12:00:00Z' },
      error: null,
    })
    mocks.rpc.mockResolvedValue({
      data: { requestId: REQUEST_ID, status: 'approved', idempotentReplay: false },
      error: null,
    })
  })

  it('lists only the Maintenance Admin own requests', async () => {
    const response = await GET(new Request('http://localhost/api/admin/approval-requests'))

    expect(response.status).toBe(200)
    expect(mocks.listEq).toHaveBeenCalledWith('requested_by', ACTOR_ID)
  })

  it('creates a pending proposal for Maintenance Admin', async () => {
    const response = await POST(jsonRequest('POST', proposal))
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.request.status).toBe('pending')
    expect(mocks.insertSingle).toHaveBeenCalledOnce()
    expect(mocks.queueInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        expected_full_name: 'Old Employee',
        expected_role_id: ROLE_ID,
        expected_department_ids: [DEPARTMENT_ID],
        expected_location_id: null,
        expected_manager_id: null,
      }),
    )
  })

  it('does not let Admin create unnecessary queued proposals', async () => {
    mocks.requireMaintenanceSession.mockResolvedValueOnce(session('Admin'))

    const response = await POST(jsonRequest('POST', proposal))

    expect(response.status).toBe(403)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects proposals with no actual change', async () => {
    mocks.targetMaybeSingle.mockResolvedValueOnce({
      data: {
        id: TARGET_ID,
        full_name: proposal.proposed_full_name,
        role_id: ROLE_ID,
        location_id: LOCATION_ID,
        manager_id: null,
      },
      error: null,
    })

    const response = await POST(jsonRequest('POST', proposal))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('does not change')
  })

  it('returns a conflict for a duplicate pending proposal', async () => {
    mocks.insertSingle.mockResolvedValueOnce({ data: null, error: { code: '23505' } })

    const response = await POST(jsonRequest('POST', proposal))

    expect(response.status).toBe(409)
  })

  it('lets Admin atomically approve and apply a pending proposal', async () => {
    const response = await PATCH(
      jsonRequest('PATCH', {
        request_id: REQUEST_ID,
        decision: 'approved',
        review_reason: 'Validated against the staff record.',
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_review_staff_approval_20260902', {
      p_actor_employee_id: ACTOR_ID,
      p_request_id: REQUEST_ID,
      p_decision: 'approved',
      p_review_reason: 'Validated against the staff record.',
    })
  })

  it('passes through non-Admin review authorization', async () => {
    mocks.requireAdminSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await PATCH(
      jsonRequest('PATCH', {
        request_id: REQUEST_ID,
        decision: 'rejected',
        review_reason: 'Not approved.',
      }),
    )

    expect(response.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns a conflict when the proposal baseline is stale', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '40001', message: 'stale request' },
    })

    const response = await PATCH(
      jsonRequest('PATCH', {
        request_id: REQUEST_ID,
        decision: 'approved',
        review_reason: 'Approve after review.',
      }),
    )

    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain('changed after submission')
  })
})
