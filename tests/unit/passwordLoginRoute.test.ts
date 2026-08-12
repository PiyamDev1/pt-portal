import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const signInWithPassword = vi.fn()
  return {
    createClient: vi.fn(() => ({ auth: { signInWithPassword } })),
    signInWithPassword,
    getLoginGuard: vi.fn(),
    recordAuthSecurityEventStrict: vi.fn(),
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/auth/securityEvents', () => ({
  getLoginGuard: mocks.getLoginGuard,
  recordAuthSecurityEventStrict: mocks.recordAuthSecurityEventStrict,
}))

import { POST } from '@/app/api/auth/password-login/route'
import { enforceRateLimit } from '@/lib/security/rateLimit'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/password-login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.8',
    },
    body: JSON.stringify(body),
  })

describe('POST /api/auth/password-login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfterSeconds: 0,
    })
    mocks.getLoginGuard.mockResolvedValue({
      locked: false,
      failedAttempts: 0,
      remainingSeconds: 0,
    })
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-1', email: 'user@example.com' },
        session: { access_token: 'access-token', refresh_token: 'refresh-token' },
      },
      error: null,
    })
    mocks.recordAuthSecurityEventStrict.mockResolvedValue(undefined)
  })

  it('rejects invalid and oversized-shaped credentials before authentication', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email', password: 'secret' }))

    expect(res.status).toBe(400)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
  })

  it('applies independent shared limits for the IP and normalized email', async () => {
    await POST(makeRequest({ email: ' USER@Example.com ', password: 'secret' }))

    expect(enforceRateLimit).toHaveBeenNthCalledWith(
      1,
      expect.any(Request),
      expect.objectContaining({
        scope: 'auth.password-login.ip',
        identities: ['ip:127.0.0.1'],
      }),
    )
    expect(enforceRateLimit).toHaveBeenNthCalledWith(
      2,
      expect.any(Request),
      expect.objectContaining({
        scope: 'auth.password-login.email',
        identities: ['email:user@example.com'],
      }),
    )
  })

  it('does not call Supabase while the server-derived login guard is locked', async () => {
    mocks.getLoginGuard.mockResolvedValueOnce({
      locked: true,
      failedAttempts: 5,
      remainingSeconds: 240,
    })

    const res = await POST(makeRequest({ email: 'user@example.com', password: 'secret' }))

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('240')
    expect(mocks.signInWithPassword).not.toHaveBeenCalled()
    expect(mocks.recordAuthSecurityEventStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        eventType: 'password_login',
        status: 'blocked',
      }),
    )
  })

  it('records only a real Supabase rejection as a login failure', async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { message: 'Invalid login credentials', code: 'invalid_credentials' },
    })

    const res = await POST(makeRequest({ email: 'USER@example.com', password: 'wrong-secret' }))

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Email or password is incorrect.' })
    expect(mocks.recordAuthSecurityEventStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@example.com',
        eventType: 'password_login',
        status: 'failed',
        metadata: { reason: 'authentication_rejected' },
      }),
    )
    expect(JSON.stringify(mocks.recordAuthSecurityEventStrict.mock.calls)).not.toContain(
      'wrong-secret',
    )
  })

  it('returns only the token pair and records the verified user on success', async () => {
    const res = await POST(makeRequest({ email: 'user@example.com', password: 'correct-secret' }))

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toContain('no-store')
    expect(await res.json()).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    expect(mocks.recordAuthSecurityEventStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        email: 'user@example.com',
        eventType: 'password_login',
        status: 'success',
      }),
    )
  })

  it('withholds a successful session if the lockout evidence cannot be persisted', async () => {
    mocks.recordAuthSecurityEventStrict.mockRejectedValueOnce(new Error('audit unavailable'))

    const res = await POST(makeRequest({ email: 'user@example.com', password: 'correct-secret' }))

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({
      error: 'Login is temporarily unavailable. Please try again shortly.',
    })
  })
})
