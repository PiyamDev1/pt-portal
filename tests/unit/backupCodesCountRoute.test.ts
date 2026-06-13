import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser } }))
  const eqUsed = vi.fn()
  const eqEmployee = vi.fn(() => ({ eq: eqUsed }))
  const select = vi.fn(() => ({ eq: eqEmployee }))
  const from = vi.fn(() => ({ select }))
  const createClient = vi.fn(() => ({ from }))
  return { getUser, getRouteSupabaseClient, eqUsed, eqEmployee, select, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { GET } from '@/app/api/auth/backup-codes/count/route'

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/auth/backup-codes/count')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe('GET /api/auth/backup-codes/count', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ eq: mocks.eqEmployee })
    mocks.eqEmployee.mockReturnValue({ eq: mocks.eqUsed })
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    })
  })

  it('returns 401 when the user is not authenticated', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('returns 500 when env vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })

  it('returns count:0 when table does not exist yet (42P01)', async () => {
    mocks.eqUsed.mockResolvedValue({
      data: null,
      error: { code: '42P01', message: 'table missing' },
    })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(0)
  })

  it('returns 500 on other Supabase errors', async () => {
    mocks.eqUsed.mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'db error' } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
  })

  it('returns the correct unused code count', async () => {
    mocks.eqUsed.mockResolvedValue({
      data: [{ id: 'c-1' }, { id: 'c-2' }, { id: 'c-3' }],
      error: null,
    })
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(3)
    expect(body).toEqual({ count: 3 })
    expect(mocks.eqEmployee).toHaveBeenCalledWith('employee_id', 'u-1')
  })
})
