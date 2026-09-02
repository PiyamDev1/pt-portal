import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireMaintenanceSession = vi.fn()
  const enforceRateLimit = vi.fn()
  const getClientIp = vi.fn(() => '203.0.113.9')
  const targetMaybeSingle = vi.fn()
  const managerMaybeSingle = vi.fn()
  const roleMaybeSingle = vi.fn()
  const locationMaybeSingle = vi.fn()
  const membershipsEq = vi.fn()
  const departmentsIn = vi.fn()
  const rpc = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'employees') {
      return {
        select: (columns: string) => ({
          eq: () => ({
            maybeSingle: columns.includes('roles(name)') ? targetMaybeSingle : managerMaybeSingle,
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
    throw new Error(`Unexpected table: ${table}`)
  })

  const admin = { from, rpc }
  const getServiceSupabaseClient = vi.fn(() => admin)

  return {
    requireMaintenanceSession,
    enforceRateLimit,
    getClientIp,
    targetMaybeSingle,
    managerMaybeSingle,
    roleMaybeSingle,
    locationMaybeSingle,
    membershipsEq,
    departmentsIn,
    rpc,
    from,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/adminSessionAuth', () => ({
  requireMaintenanceSession: mocks.requireMaintenanceSession,
}))

vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: mocks.getClientIp,
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { POST } from '@/app/api/admin/update-employee/route'

const EMPLOYEE_ID = '10000000-0000-4000-8000-000000000001'
const ROLE_ID = '20000000-0000-4000-8000-000000000001'
const NEW_ROLE_ID = '20000000-0000-4000-8000-000000000002'
const DEPARTMENT_ID = '30000000-0000-4000-8000-000000000001'
const OTHER_DEPARTMENT_ID = '30000000-0000-4000-8000-000000000002'
const HR_DEPARTMENT_ID = '30000000-0000-4000-8000-000000000003'
const LOCATION_ID = '40000000-0000-4000-8000-000000000001'

const validBody = {
  employee_id: EMPLOYEE_ID,
  full_name: 'Updated Employee',
  role_id: ROLE_ID,
  department_ids: [DEPARTMENT_ID],
  location_id: LOCATION_ID,
  manager_id: null,
}

function request(body: unknown) {
  return new Request('http://localhost/api/admin/update-employee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function authorize(role: string) {
  mocks.requireMaintenanceSession.mockResolvedValue({
    authorized: true,
    user: { id: 'actor-id', email: 'actor@example.com' },
    employee: {
      id: 'actor-id',
      email: 'actor@example.com',
      fullName: 'Actor',
      role,
      departments: [],
    },
  })
}

describe('POST /api/admin/update-employee', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authorize('Admin')
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.targetMaybeSingle.mockResolvedValue({
      data: {
        id: EMPLOYEE_ID,
        role_id: ROLE_ID,
        manager_id: null,
        roles: { name: 'Agent' },
      },
      error: null,
    })
    mocks.membershipsEq.mockResolvedValue({
      data: [{ department_id: DEPARTMENT_ID }],
      error: null,
    })
    mocks.roleMaybeSingle.mockResolvedValue({
      data: { id: ROLE_ID, name: 'Agent' },
      error: null,
    })
    mocks.departmentsIn.mockResolvedValue({
      data: [{ id: DEPARTMENT_ID, name: 'Ticketing' }],
      error: null,
    })
    mocks.locationMaybeSingle.mockResolvedValue({ data: { id: LOCATION_ID }, error: null })
    mocks.managerMaybeSingle.mockResolvedValue({ data: { id: 'manager-id' }, error: null })
    mocks.rpc.mockResolvedValue({ error: null })
  })

  it('passes through an unauthorized maintenance-session response', async () => {
    mocks.requireMaintenanceSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })

    const response = await POST(request(validBody))

    expect(response.status).toBe(403)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('lets Maintenance Admin correct a name or branch without changing access', async () => {
    authorize('Maintenance Admin')

    const response = await POST(request(validBody))

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_update_employee_assignments_20260902', {
      p_employee_id: EMPLOYEE_ID,
      p_full_name: 'Updated Employee',
      p_role_id: ROLE_ID,
      p_department_ids: [DEPARTMENT_ID],
      p_location_id: LOCATION_ID,
      p_manager_id: null,
    })
  })

  it('requires Admin approval when Maintenance Admin changes a role', async () => {
    authorize('Maintenance Admin')
    mocks.roleMaybeSingle.mockResolvedValue({
      data: { id: NEW_ROLE_ID, name: 'Admin' },
      error: null,
    })

    const response = await POST(request({ ...validBody, role_id: NEW_ROLE_ID }))

    expect(response.status).toBe(403)
    expect((await response.json()).error).toContain('An Admin must approve')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each(['Maintenance Admin', 'Admin'])(
    'allows Admin to assign %s and normal departments',
    async (roleName) => {
      mocks.roleMaybeSingle.mockResolvedValue({
        data: { id: NEW_ROLE_ID, name: roleName },
        error: null,
      })
      mocks.departmentsIn.mockResolvedValue({
        data: [
          { id: DEPARTMENT_ID, name: 'Ticketing' },
          { id: OTHER_DEPARTMENT_ID, name: 'Applications' },
        ],
        error: null,
      })

      const response = await POST(
        request({
          ...validBody,
          role_id: NEW_ROLE_ID,
          department_ids: [DEPARTMENT_ID, OTHER_DEPARTMENT_ID],
        }),
      )

      expect(response.status).toBe(200)
      expect(mocks.rpc).toHaveBeenCalledOnce()
    },
  )

  it('prevents Admin from changing HR membership', async () => {
    mocks.departmentsIn.mockResolvedValue({
      data: [
        { id: DEPARTMENT_ID, name: 'Ticketing' },
        { id: HR_DEPARTMENT_ID, name: 'Human Resources' },
      ],
      error: null,
    })

    const response = await POST(
      request({ ...validBody, department_ids: [DEPARTMENT_ID, HR_DEPARTMENT_ID] }),
    )

    expect(response.status).toBe(403)
    expect((await response.json()).error).toContain('HR membership')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('prevents Admin from assigning Master Admin or Super Admin', async () => {
    mocks.roleMaybeSingle.mockResolvedValue({
      data: { id: NEW_ROLE_ID, name: 'Super Admin' },
      error: null,
    })

    const response = await POST(request({ ...validBody, role_id: NEW_ROLE_ID }))

    expect(response.status).toBe(403)
    expect((await response.json()).error).toContain('Master Admin or Super Admin')
  })

  it('lets Super Admin change privileged roles and HR membership', async () => {
    authorize('Super Admin')
    mocks.roleMaybeSingle.mockResolvedValue({
      data: { id: NEW_ROLE_ID, name: 'Master Admin' },
      error: null,
    })
    mocks.departmentsIn.mockResolvedValue({
      data: [
        { id: DEPARTMENT_ID, name: 'Ticketing' },
        { id: HR_DEPARTMENT_ID, name: 'HR' },
      ],
      error: null,
    })

    const response = await POST(
      request({
        ...validBody,
        role_id: NEW_ROLE_ID,
        department_ids: [DEPARTMENT_ID, HR_DEPARTMENT_ID],
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it('rejects unknown fields before touching the database', async () => {
    const response = await POST(request({ ...validBody, role: 'Super Admin' }))

    expect(response.status).toBe(400)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
