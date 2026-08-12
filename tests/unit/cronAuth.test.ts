import { afterAll, describe, expect, it } from 'vitest'
import { requireCronAuthorization } from '@/lib/security/cronAuth.server'

describe('requireCronAuthorization', () => {
  const originalSecret = process.env.CRON_SECRET

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = originalSecret
  })

  it('fails closed when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET

    const response = requireCronAuthorization(new Request('http://localhost/api/cron/test'))

    expect(response?.status).toBe(503)
    expect(response?.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response?.headers.get('Retry-After')).toBe('60')
    await expect(response?.json()).resolves.toEqual({
      error: 'Scheduled job authentication is not configured',
    })
  })

  it('rejects a missing or incorrect Bearer token', async () => {
    process.env.CRON_SECRET = 'expected-secret'

    for (const authorization of [null, 'Bearer wrong-secret', 'Basic expected-secret']) {
      const headers = authorization ? { authorization } : undefined
      const response = requireCronAuthorization(
        new Request('http://localhost/api/cron/test', { headers }),
      )

      expect(response?.status).toBe(401)
      expect(response?.headers.get('Cache-Control')).toBe('private, no-store')
      await expect(response?.json()).resolves.toEqual({ error: 'Unauthorized' })
    }
  })

  it('does not trust a client-supplied x-vercel-cron header', () => {
    process.env.CRON_SECRET = 'expected-secret'

    const response = requireCronAuthorization(
      new Request('http://localhost/api/cron/test', {
        headers: { 'x-vercel-cron': '1' },
      }),
    )

    expect(response?.status).toBe(401)
  })

  it('accepts the exact Vercel-compatible Bearer credential', () => {
    process.env.CRON_SECRET = '  expected-secret  '

    const response = requireCronAuthorization(
      new Request('http://localhost/api/cron/test', {
        headers: { authorization: 'Bearer expected-secret' },
      }),
    )

    expect(response).toBeNull()
  })
})
