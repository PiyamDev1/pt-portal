import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const linkSingle = vi.fn()
  const linkEq = vi.fn(() => ({ single: linkSingle }))
  const linkSelect = vi.fn(() => ({ eq: linkEq }))

  const directSingle = vi.fn()
  const directEq = vi.fn(() => ({ single: directSingle }))
  const directSelect = vi.fn(() => ({ eq: directEq }))

  const historyOrder = vi.fn()
  const historyEq = vi.fn(() => ({ order: historyOrder }))
  const historySelect = vi.fn(() => ({ eq: historyEq }))

  const from = vi.fn((table: string) => {
    if (table === 'pakistani_passport_applications') {
      // First call is link lookup, second call is direct fallback.
      const callCount = from.mock.calls.filter(
        (c) => c[0] === 'pakistani_passport_applications',
      ).length
      if (callCount <= 1) return { select: linkSelect }
      return { select: directSelect }
    }
    if (table === 'pakistani_passport_status_history') {
      return { select: historySelect }
    }
    return {}
  })

  const getServiceSupabaseClient = vi.fn(() => ({ from }))
  const requireStaffSession = vi.fn()

  return {
    linkSingle,
    linkEq,
    linkSelect,
    directSingle,
    directEq,
    directSelect,
    historyOrder,
    historyEq,
    historySelect,
    from,
    getServiceSupabaseClient,
    requireStaffSession,
  }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

import { GET } from '@/app/api/passports/pak/status-history/route'

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/passports/pak/status-history')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

describe('GET /api/passports/pak/status-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'staff-1', email: 'staff@example.com' },
      employee: {
        id: 'staff-1',
        email: 'staff@example.com',
        fullName: 'Staff',
        role: 'Agent',
        departments: [],
      },
    })
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'pakistani_passport_applications') {
        const callCount = mocks.from.mock.calls.filter(
          (call) => call[0] === 'pakistani_passport_applications',
        ).length
        if (callCount <= 1) return { select: mocks.linkSelect }
        return { select: mocks.directSelect }
      }
      if (table === 'pakistani_passport_status_history') {
        return { select: mocks.historySelect }
      }
      return {}
    })
    mocks.linkSelect.mockReturnValue({ eq: mocks.linkEq })
    mocks.linkEq.mockReturnValue({ single: mocks.linkSingle })
    mocks.directSelect.mockReturnValue({ eq: mocks.directEq })
    mocks.directEq.mockReturnValue({ single: mocks.directSingle })
    mocks.historySelect.mockReturnValue({ eq: mocks.historyEq })
    mocks.historyEq.mockReturnValue({ order: mocks.historyOrder })
  })

  it('returns 404 when neither passportId nor applicationId resolve', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/record not found/i)
  })

  it('returns empty history when application link lookup fails and direct id is missing', async () => {
    mocks.linkSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    mocks.directSingle.mockResolvedValue({ data: null, error: null })

    const res = await GET(makeRequest({ applicationId: 'app-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.history).toEqual([])
  })

  it('resolves via link and returns mapped history list', async () => {
    mocks.linkSingle.mockResolvedValue({ data: { id: 'pp-1' }, error: null })
    mocks.historyOrder.mockResolvedValue({
      data: [
        {
          id: 'h-1',
          new_status: 'Ready',
          changed_at: '2025-02-01T10:00:00Z',
          employees: { full_name: 'Ops User' },
        },
      ],
      error: null,
    })

    const res = await GET(makeRequest({ applicationId: 'app-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.history).toEqual([
      {
        id: 'h-1',
        status: 'Ready',
        changed_by: 'Ops User',
        date: '2025-02-01T10:00:00Z',
        description: 'Status changed to Ready',
      },
    ])
  })

  it('resolves legacy records where the application ID is the passport record ID', async () => {
    mocks.linkSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    mocks.directSingle.mockResolvedValue({ data: { id: 'legacy-pp-1' }, error: null })
    mocks.historyOrder.mockResolvedValue({ data: [], error: null })

    const res = await GET(makeRequest({ applicationId: 'legacy-pp-1' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ history: [] })
    expect(mocks.historyEq).toHaveBeenCalledWith('passport_application_id', 'legacy-pp-1')
  })

  it('returns 500 when history query fails', async () => {
    mocks.historyOrder.mockResolvedValue({ data: null, error: { message: 'db fail' } })
    const res = await GET(makeRequest({ passportId: 'pp-1' }))
    expect(res.status).toBe(500)
  })

  it('returns 400 for an oversized lookup ID', async () => {
    const res = await GET(makeRequest({ passportId: 'x'.repeat(201) }))
    expect(res.status).toBe(400)
  })
})
