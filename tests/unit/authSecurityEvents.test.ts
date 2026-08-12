import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.in = vi.fn(() => query)
  query.gte = vi.fn(() => query)
  query.order = vi.fn(() => query)
  query.limit = vi.fn()
  const from = vi.fn(() => query)
  return { query, from, getSupabaseClient: vi.fn(() => ({ from })) }
})

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

import { getLoginGuard } from '@/lib/auth/securityEvents'

describe('getLoginGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.query.limit.mockResolvedValue({ data: [], error: null })
  })

  it('queries only outcome rows so blocked telemetry cannot crowd failures out', async () => {
    await getLoginGuard(' User@Example.com ')

    expect(mocks.query.eq).toHaveBeenCalledWith('event_type', 'password_login')
    expect(mocks.query.eq).toHaveBeenCalledWith('email', 'user@example.com')
    expect(mocks.query.in).toHaveBeenCalledWith('status', ['failed', 'success'])
  })
})
