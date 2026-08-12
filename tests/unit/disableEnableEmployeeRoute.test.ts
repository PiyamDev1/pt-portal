import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const requireStaffSession = vi.fn()
  const verifyFreshSecondFactor = vi.fn()
  const adminFrom = vi.fn()
  const getServiceSupabaseClient = vi.fn(() => ({ from: adminFrom }))
  return {
    requireStaffSession,
    verifyFreshSecondFactor,
    adminFrom,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

vi.mock('@/lib/auth/freshSecondFactor', () => ({
  verifyFreshSecondFactor: mocks.verifyFreshSecondFactor,
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { POST } from '@/app/api/admin/disable-enable-employee/route'

const makeRequest = (body: object) =>
  new Request('http://localhost/api/admin/disable-enable-employee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('/api/admin/disable-enable-employee route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'u-1', email: 'admin@example.com' },
      employee: {
        id: 'u-1',
        email: 'admin@example.com',
        fullName: 'Admin',
        role: 'Master Admin',
        departments: [],
      },
    })
    mocks.verifyFreshSecondFactor.mockResolvedValue({ verified: true, method: 'totp' })
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.adminFrom })
  })

  it('returns 401 when caller is not authenticated', async () => {
    mocks.requireStaffSession.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(makeRequest({ employeeId: 'emp-2', isActive: false }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('returns 400 when required params are missing', async () => {
    const response = await POST(makeRequest({ employeeId: 'emp-2' }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toMatch(/invalid|required|isActive/i)
  })

  it('returns 400 when trying to disable own account', async () => {
    const response = await POST(makeRequest({ employeeId: 'u-1', isActive: false }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Cannot disable your own account')
  })

  it('successfully enables an employee as Master Admin', async () => {
    const updateEq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    mocks.adminFrom.mockImplementation(() => ({ update }))

    const response = await POST(makeRequest({ employeeId: 'emp-2', isActive: true }))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.updatedEmployeeId).toBe('emp-2')
    expect(payload.isActive).toBe(true)
    expect(payload.message).toBe('Employee enabled successfully')
    expect(update).toHaveBeenCalledWith({ is_active: true })
    expect(updateEq).toHaveBeenCalledWith('id', 'emp-2')
  })
})
