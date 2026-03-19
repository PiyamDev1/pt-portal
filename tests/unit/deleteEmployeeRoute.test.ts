import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const adminSingle = vi.fn()
  const adminEq = vi.fn(() => ({ single: adminSingle }))
  const adminSelect = vi.fn(() => ({ eq: adminEq }))
  const adminDeleteEq = vi.fn(async () => ({ error: null }))
  const adminDelete = vi.fn(() => ({ eq: adminDeleteEq }))
  const adminFrom = vi.fn((table: string) => {
    if (table === 'audit_logs') return { insert: vi.fn(async () => ({ error: null })) }
    return { select: adminSelect, delete: adminDelete }
  })
  const updateUserById = vi.fn(async () => ({}))
  const createClient = vi.fn(() => ({
    from: adminFrom,
    auth: { admin: { updateUserById } },
  }))
  const createServerClient = vi.fn(() => ({ auth: { getUser } }))

  return {
    getUser,
    adminSingle,
    adminEq,
    adminSelect,
    adminDelete,
    adminFrom,
    createClient,
    createServerClient,
    updateUserById,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createServerClient: mocks.createServerClient }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}))

import { POST } from '@/app/api/admin/delete-employee/route'

const makeRequest = (body: Record<string, unknown> = {}) =>
  new Request('http://localhost/api/admin/delete-employee', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('DELETE /api/admin/delete-employee', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({
      from: mocks.adminFrom,
      auth: { admin: { updateUserById: mocks.updateUserById } },
    })
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } })
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === 'audit_logs') return { insert: vi.fn(async () => ({ error: null })) }
      return { select: mocks.adminSelect, delete: mocks.adminDelete }
    })
    mocks.adminSelect.mockReturnValue({ eq: mocks.adminEq })
    mocks.adminEq.mockReturnValue({ single: mocks.adminSingle })
    mocks.adminSingle.mockResolvedValue({ data: null, error: null })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(makeRequest({ employeeId: 'e-1', confirmEmail: 'a@b.com' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('returns 400 when required params are missing', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@test.com' } },
      error: null,
    })
    const res = await POST(makeRequest({ employeeId: 'e-1' })) // missing confirmEmail
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing/i)
  })

  it('returns 404 when caller profile is not found', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'admin@test.com' } },
      error: null,
    })
    mocks.adminSingle.mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    const res = await POST(makeRequest({ employeeId: 'e-2', confirmEmail: 'target@test.com' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/profile not found/i)
  })

  it('returns 403 when caller is not Master Admin', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'employee@test.com' } },
      error: null,
    })
    mocks.adminSingle.mockResolvedValueOnce({
      data: { id: 'u-1', roles: { name: 'Employee' } },
      error: null,
    })
    const res = await POST(makeRequest({ employeeId: 'e-2', confirmEmail: 'target@test.com' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/forbidden/i)
  })

  it('returns 400 when admin tries to delete their own account', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-admin', email: 'admin@test.com' } },
      error: null,
    })
    mocks.adminSingle.mockResolvedValueOnce({
      data: { id: 'u-admin', roles: { name: 'Master Admin' } },
      error: null,
    })
    const res = await POST(makeRequest({ employeeId: 'u-admin', confirmEmail: 'admin@test.com' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cannot delete your own/i)
  })
})
