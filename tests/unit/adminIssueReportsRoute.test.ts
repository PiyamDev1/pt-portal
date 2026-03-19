import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const auth = vi.fn()

  const reportsResult = {
    data: [
      {
        id: 'report-1',
        status: 'open',
        assigned_to_user_id: 'admin-1',
      },
    ],
    error: null,
  }

  const assigneesResult = {
    data: [{ id: 'emp-1', full_name: 'Alex Agent', is_active: true }],
    error: null,
  }

  const createQuery = (result: { data: unknown; error: unknown }) => {
    const query: {
      eq: ReturnType<typeof vi.fn>
      is: ReturnType<typeof vi.fn>
      or: ReturnType<typeof vi.fn>
      order: ReturnType<typeof vi.fn>
      limit: ReturnType<typeof vi.fn>
      then: (resolve: (value: typeof result) => unknown) => Promise<unknown>
    } = {
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      or: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      then: (resolve) => Promise.resolve(result).then(resolve),
    }
    return query
  }

  const reportsQuery = createQuery(reportsResult)
  const assigneesQuery = createQuery(assigneesResult)

  const from = vi.fn((table: string) => {
    if (table === 'issue_reports') {
      return {
        select: vi.fn(() => reportsQuery),
      }
    }

    if (table === 'employees') {
      return {
        select: vi.fn(() => assigneesQuery),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    auth,
    from,
  }
})

vi.mock('@/lib/issueReportAuth', () => ({
  verifyMasterAdminSession: mocks.auth,
}))

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
}))

import { GET } from '@/app/api/admin/issue-reports/route'

describe('GET /api/admin/issue-reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns auth error when session is unauthorized', async () => {
    mocks.auth.mockResolvedValue({ authorized: false, error: 'Forbidden', status: 403 })

    const response = await GET(new Request('http://localhost/api/admin/issue-reports'))
    const payload = await response.json()

    expect(response.status).toBe(403)
    expect(payload).toEqual({ error: 'Forbidden' })
  })

  it('returns reports and assignees for authorized admin', async () => {
    mocks.auth.mockResolvedValue({ authorized: true, user: { id: 'admin-1' } })

    const response = await GET(new Request('http://localhost/api/admin/issue-reports'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.currentAdminId).toBe('admin-1')
    expect(Array.isArray(payload.reports)).toBe(true)
    expect(payload.reports).toHaveLength(1)
    expect(payload.assignees).toEqual([{ id: 'emp-1', name: 'Alex Agent' }])
  })
})
