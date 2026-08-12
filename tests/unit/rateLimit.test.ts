import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const rpc = vi.fn()
  const getServiceSupabaseClient = vi.fn(() => ({ rpc }))
  const logServerEvent = vi.fn()
  const reportOperationalError = vi.fn()
  return { rpc, getServiceSupabaseClient, logServerEvent, reportOperationalError }
})

vi.unmock('@/lib/security/rateLimit')
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/observability/server', () => ({
  logServerEvent: mocks.logServerEvent,
  reportOperationalError: mocks.reportOperationalError,
}))

import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

describe('shared API rate limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.RATE_LIMIT_HASH_SECRET = 'test-only-rate-limit-pepper'
    mocks.rpc.mockResolvedValue({
      data: [{ allowed: true, remaining: 4, retry_after_seconds: 0 }],
      error: null,
    })
  })

  it('uses the first trusted forwarding address', () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
    })
    expect(getClientIp(request)).toBe('203.0.113.10')
  })

  it('hashes identities before calling the atomic database limiter', async () => {
    const request = new Request('http://localhost/api/test')
    const result = await enforceRateLimit(request, {
      scope: 'auth.test',
      limit: 5,
      windowSeconds: 60,
      identities: ['user:sensitive-user-id'],
    })

    expect(result).toEqual({ allowed: true, remaining: 4, retryAfterSeconds: 0 })
    expect(mocks.rpc).toHaveBeenCalledWith(
      'check_api_rate_limit',
      expect.objectContaining({
        p_scope: 'auth.test',
        p_limit: 5,
        p_window_seconds: 60,
        p_identity_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    )
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain('sensitive-user-id')
  })

  it('returns a normalized 429 response with Retry-After', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 37 }],
      error: null,
    })

    const result = await enforceRateLimit(new Request('http://localhost/api/test'), {
      scope: 'auth.test',
      limit: 5,
      windowSeconds: 60,
    })

    expect(result.allowed).toBe(false)
    if (result.allowed) throw new Error('Expected blocked rate limit')
    expect(result.response.status).toBe(429)
    expect(result.response.headers.get('Retry-After')).toBe('37')
    expect(await result.response.json()).toEqual({
      error: 'Too many requests. Please wait before trying again.',
    })
  })

  it('fails closed when the shared database limiter is unavailable', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc unavailable' } })

    const result = await enforceRateLimit(new Request('http://localhost/api/test'), {
      scope: 'auth.test',
      limit: 5,
      windowSeconds: 60,
    })

    expect(result.allowed).toBe(false)
    if (result.allowed) throw new Error('Expected blocked rate limit')
    expect(result.response.status).toBe(503)
    expect(result.response.headers.get('Retry-After')).toBe('30')
  })

  it('can fail open without alert delivery for noncritical telemetry', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'rpc unavailable' } })

    const result = await enforceRateLimit(new Request('http://localhost/api/vitals'), {
      scope: 'public.performance-metrics',
      limit: 120,
      windowSeconds: 60,
      unavailable: 'allow',
    })

    expect(result).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 })
    expect(mocks.logServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'telemetry.rate_limit_unavailable', level: 'warn' }),
    )
    expect(mocks.reportOperationalError).not.toHaveBeenCalled()
  })
})
