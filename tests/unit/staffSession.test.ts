import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const employeeMaybeSingle = vi.fn()
  const employeeEq = vi.fn(() => ({ maybeSingle: employeeMaybeSingle }))
  const employeeSelect = vi.fn(() => ({ eq: employeeEq }))
  const departmentEq = vi.fn()
  const departmentSelect = vi.fn(() => ({ eq: departmentEq }))
  const from = vi.fn((table: string) =>
    table === 'employee_departments' ? { select: departmentSelect } : { select: employeeSelect },
  )
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser } }))
  const getServiceSupabaseClient = vi.fn(() => ({ from }))

  return {
    getUser,
    employeeMaybeSingle,
    employeeEq,
    employeeSelect,
    departmentEq,
    departmentSelect,
    from,
    getRouteSupabaseClient,
    getServiceSupabaseClient,
  }
})

vi.unmock('@/lib/auth/staffSession')
vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { requireStaffSession } from '@/lib/auth/staffSession'

describe('requireStaffSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'staff-1', email: 'staff@example.com' } },
      error: null,
    })
    mocks.employeeMaybeSingle.mockResolvedValue({
      data: {
        id: 'staff-1',
        email: 'staff@example.com',
        full_name: 'Staff Member',
        is_active: true,
        roles: { name: 'Master Admin' },
      },
      error: null,
    })
    mocks.departmentEq.mockResolvedValue({
      data: [{ departments: { name: 'Applications' } }],
      error: null,
    })
  })

  it('rejects a request with no authenticated user', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const result = await requireStaffSession()

    expect(result.authorized).toBe(false)
    if (!result.authorized) expect(result.response.status).toBe(401)
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects inactive employee profiles', async () => {
    mocks.employeeMaybeSingle.mockResolvedValueOnce({
      data: { id: 'staff-1', is_active: false, roles: { name: 'Master Admin' } },
      error: null,
    })

    const result = await requireStaffSession()

    expect(result.authorized).toBe(false)
    if (!result.authorized) expect(result.response.status).toBe(403)
  })

  it('normalizes role names when enforcing role access', async () => {
    mocks.employeeMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'staff-1',
        email: 'staff@example.com',
        full_name: 'Staff Member',
        is_active: true,
        roles: { name: 'master_admin' },
      },
      error: null,
    })

    const result = await requireStaffSession({ roles: ['Master Admin'] })

    expect(result.authorized).toBe(true)
  })

  it('derives identity and department membership from server-side records', async () => {
    const result = await requireStaffSession({ departments: ['applications'] })

    expect(result).toEqual({
      authorized: true,
      user: { id: 'staff-1', email: 'staff@example.com' },
      employee: {
        id: 'staff-1',
        email: 'staff@example.com',
        fullName: 'Staff Member',
        role: 'Master Admin',
        departments: ['Applications'],
      },
    })
    expect(mocks.departmentEq).toHaveBeenCalledWith('employee_id', 'staff-1')
  })
})
