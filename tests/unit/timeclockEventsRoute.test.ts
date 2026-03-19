import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

  const getSession = vi.fn()

  const empSelect = vi.fn()
  const adminFrom = vi.fn((table: string) => {
    if (table === 'employees') return { select: empSelect }
    return {}
  })

  const maybeSingle = vi.fn()
  const profileEq = vi.fn(() => ({ maybeSingle }))
  const profileSelect = vi.fn(() => ({ eq: profileEq }))
  const serverFrom = vi.fn(() => ({ select: profileSelect }))

  const createClient = vi.fn(() => ({ from: adminFrom }))
  const createServerClient = vi.fn(() => ({ auth: { getSession }, from: serverFrom }))

  return {
    getSession,
    empSelect,
    adminFrom,
    maybeSingle,
    profileEq,
    profileSelect,
    serverFrom,
    createClient,
    createServerClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createServerClient: mocks.createServerClient }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
}))

import { GET } from '@/app/api/timeclock/events/route'

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/timeclock/events')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe('GET /api/timeclock/events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockReturnValue({ from: mocks.adminFrom })
    mocks.createServerClient.mockReturnValue({
      auth: { getSession: mocks.getSession },
      from: mocks.serverFrom,
    })
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === 'employees') return { select: mocks.empSelect }
      return {}
    })
    mocks.serverFrom.mockReturnValue({ select: mocks.profileSelect })
    mocks.profileSelect.mockReturnValue({ eq: mocks.profileEq })
    mocks.profileEq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
  })

  it('returns 401 when there is no session', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('returns 500 when the employees query fails', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } })
    mocks.empSelect.mockResolvedValue({ data: null, error: { message: 'db failure' } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })

  it('returns 403 for team scope when user has no manager access', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } })
    mocks.empSelect.mockResolvedValue({
      data: [{ id: 'u-1', full_name: 'Test User', manager_id: null, roles: { name: 'Employee' } }],
      error: null,
    })
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(makeRequest({ scope: 'team' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/forbidden/i)
  })
})
