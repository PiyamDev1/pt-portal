import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser } }))
  const recordAuthSecurityEvent = vi.fn()
  return { getUser, getRouteSupabaseClient, recordAuthSecurityEvent }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

vi.mock('@/lib/auth/securityEvents', () => ({
  recordAuthSecurityEvent: mocks.recordAuthSecurityEvent,
}))

import { POST } from '@/app/api/auth/security-events/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/security-events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/auth/security-events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    })
  })

  it('rejects invalid event types', async () => {
    const res = await POST(makeRequest({ eventType: 'bad', status: 'success' }))
    expect(res.status).toBe(400)
  })

  it('rejects invalid event statuses', async () => {
    const res = await POST(makeRequest({ eventType: 'password_login', status: 'bad' }))
    expect(res.status).toBe(400)
  })

  it('records a valid security event with the session user id', async () => {
    const res = await POST(
      makeRequest({
        eventType: 'password_login',
        status: 'success',
        email: 'user@example.com',
        userId: 'spoofed-user',
        metadata: { source: 'unit-test' },
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.recordAuthSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u-1',
        email: 'user@example.com',
        eventType: 'password_login',
        status: 'success',
        metadata: { source: 'unit-test' },
      }),
    )
  })
})
