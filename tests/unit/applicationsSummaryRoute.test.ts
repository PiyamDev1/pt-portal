import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRouteSupabaseClient: vi.fn(),
  loadApplicationSummary: vi.fn(),
  requireStaffSession: vi.fn(),
}))

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

vi.mock('@/lib/applications/summary.server', () => ({
  loadApplicationSummary: mocks.loadApplicationSummary,
}))

vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

import { GET } from '@/app/api/applications/summary/route'

describe('GET /api/applications/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'user-1', email: 'staff@example.com' },
      employee: { id: 'user-1', email: 'staff@example.com', fullName: 'Staff', role: 'Admin' },
    })
    mocks.getRouteSupabaseClient.mockResolvedValue({ from: vi.fn() })
    mocks.loadApplicationSummary.mockResolvedValue({ generatedAt: '2026-09-28T10:00:00.000Z' })
  })

  it('returns the shared summary with private no-store caching', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ generatedAt: '2026-09-28T10:00:00.000Z' })
    expect(mocks.loadApplicationSummary).toHaveBeenCalledWith(
      await mocks.getRouteSupabaseClient.mock.results[0].value,
    )
  })

  it('returns the staff guard response without loading application data', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET()

    expect(response.status).toBe(401)
    expect(mocks.getRouteSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.loadApplicationSummary).not.toHaveBeenCalled()
  })

  it('does not expose database errors', async () => {
    mocks.loadApplicationSummary.mockRejectedValue(new Error('sensitive database detail'))

    const response = await GET()

    expect(response.status).toBe(500)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ error: 'Application summary failed' })
  })
})
