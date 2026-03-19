import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const getUser = vi.fn()
  const createServerClientInstance = { auth: { getUser } }
  const createServerClient = vi.fn(() => createServerClientInstance)
  const adminFrom = vi.fn()
  const createClient = vi.fn(() => ({ from: adminFrom }))
  const cookies = vi.fn(async () => ({ getAll: () => [] }))
  return { from, getUser, createServerClient, adminFrom, createClient, cookies }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
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
  })

  it('returns 401 when caller is not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: 'no auth' } })

    const response = await POST(makeRequest({ employeeId: 'emp-2', isActive: false }))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('returns 400 when required params are missing', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null })

    const response = await POST(makeRequest({ employeeId: 'emp-2' }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('Missing or invalid parameters')
  })

  it('returns 400 when trying to disable own account', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'self@example.com' } },
      error: null,
    })

    // Admin profile lookup: Super Admin role so no manager check
    const single = vi.fn(async () => ({
      data: { id: 'u-1', manager_id: null, roles: { name: 'Master Admin' } },
      error: null,
    }))
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    mocks.adminFrom.mockImplementation(() => ({ select }))

    const response = await POST(makeRequest({ employeeId: 'u-1', isActive: false }))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('Cannot disable your own account')
  })

  it('successfully enables an employee as Master Admin', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@example.com' } },
      error: null,
    })

    const updateEq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))

    const single = vi.fn(async () => ({
      data: { id: 'u-1', manager_id: null, roles: { name: 'Master Admin' } },
      error: null,
    }))
    const selectEq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq: selectEq }))

    mocks.adminFrom.mockImplementation(() => ({ select, update }))

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
