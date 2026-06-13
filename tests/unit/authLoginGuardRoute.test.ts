import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getLoginGuard: vi.fn(),
  recordAuthSecurityEvent: vi.fn(),
}))

vi.mock('@/lib/auth/securityEvents', () => ({
  getLoginGuard: mocks.getLoginGuard,
  recordAuthSecurityEvent: mocks.recordAuthSecurityEvent,
}))

import { POST } from '@/app/api/auth/login-guard/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/login-guard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/auth/login-guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getLoginGuard.mockResolvedValue({
      locked: false,
      failedAttempts: 0,
      remainingSeconds: 0,
    })
  })

  it('returns 400 when email is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns the login guard status', async () => {
    const res = await POST(makeRequest({ email: 'User@Example.com ' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      locked: false,
      failedAttempts: 0,
      remainingSeconds: 0,
    })
    expect(mocks.getLoginGuard).toHaveBeenCalledWith('user@example.com')
  })

  it('records a blocked event when the guard is locked', async () => {
    mocks.getLoginGuard.mockResolvedValue({
      locked: true,
      failedAttempts: 5,
      remainingSeconds: 600,
    })

    const res = await POST(makeRequest({ email: 'user@example.com' }))
    expect(res.status).toBe(200)
    expect(mocks.recordAuthSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        eventType: 'password_login',
        status: 'blocked',
        metadata: { failedAttempts: 5 },
      }),
    )
  })
})
