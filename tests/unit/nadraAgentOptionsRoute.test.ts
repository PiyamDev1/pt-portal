import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const selectEmployees = vi.fn()
  const from = vi.fn((table: string) => {
    if (table === 'employees') {
      return { select: selectEmployees }
    }
    return {}
  })
  const createClient = vi.fn(() => ({ from }))

  return { selectEmployees, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { GET } from '@/app/api/nadra/agent-options/route'

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/nadra/agent-options')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe('GET /api/nadra/agent-options', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'employees') return { select: mocks.selectEmployees }
      return {}
    })
  })

  it('returns 400 when userId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing userid/i)
  })

  it('returns 404 when user is not found', async () => {
    mocks.selectEmployees.mockResolvedValue({
      data: [{ id: 'u-2', full_name: 'Other User', manager_id: null, roles: { name: 'Employee' } }],
      error: null,
    })

    const res = await GET(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/user not found/i)
  })

  it('returns scoped options for non-master users', async () => {
    mocks.selectEmployees.mockResolvedValue({
      data: [
        { id: 'u-1', full_name: 'Manager One', manager_id: null, roles: { name: 'Manager' } },
        { id: 'u-2', full_name: 'Agent B', manager_id: 'u-1', roles: { name: 'Employee' } },
        { id: 'u-3', full_name: 'Agent A', manager_id: 'u-1', roles: { name: 'Employee' } },
        { id: 'u-4', full_name: 'Outside User', manager_id: null, roles: { name: 'Employee' } },
      ],
      error: null,
    })

    const res = await GET(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.canChangeAgent).toBe(true)
    expect(body.agentOptions).toEqual([
      { id: 'u-3', name: 'Agent A' },
      { id: 'u-2', name: 'Agent B' },
      { id: 'u-1', name: 'Manager One' },
    ])
    expect(body.role).toBe('Manager')
  })

  it('returns all employees for Master Admin', async () => {
    mocks.selectEmployees.mockResolvedValue({
      data: [
        { id: 'm-1', full_name: 'Master', manager_id: null, roles: { name: 'Master Admin' } },
        { id: 'u-2', full_name: 'Agent B', manager_id: 'm-1', roles: { name: 'Employee' } },
      ],
      error: null,
    })

    const res = await GET(makeRequest({ userId: 'm-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.canChangeAgent).toBe(true)
    expect(body.agentOptions).toHaveLength(2)
  })
})
