import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

import { POST } from '@/app/api/vitals/route'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

describe('/api/vitals route', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns success payload for a valid payload', async () => {
    const request = new Request('http://localhost/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'CLS', value: 0.01, id: 'v1' }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ received: true })
    expect(getClientIp).toHaveBeenCalledWith(request)
    expect(enforceRateLimit).toHaveBeenCalledWith(request, {
      scope: 'public.performance-metrics',
      limit: 120,
      windowSeconds: 60,
      identities: ['ip:127.0.0.1'],
      message: 'Too many performance metrics. Please wait before sending more.',
      unavailable: 'allow',
    })
  })

  it('returns the shared limiter response before parsing the payload', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
      response: NextResponse.json(
        { error: 'Too many performance metrics. Please wait before sending more.' },
        {
          status: 429,
          headers: { 'Retry-After': '42', 'Cache-Control': 'private, no-store' },
        },
      ),
    })
    const request = new Request('http://localhost/api/vitals', {
      method: 'POST',
      body: 'not-json',
    })

    const response = await POST(request)

    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('42')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    await expect(response.json()).resolves.toEqual({
      error: 'Too many performance metrics. Please wait before sending more.',
    })
  })

  it('returns 400 error payload when payload is invalid JSON', async () => {
    const request = new Request('http://localhost/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBeTruthy()
    expect(typeof payload.error).toBe('string')
  })

  it('rejects JSON that is not a supported performance metric', async () => {
    const request = new Request('http://localhost/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'unknown', value: 'slow' }),
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) })
  })

  it('rejects payloads above the endpoint byte limit', async () => {
    const request = new Request('http://localhost/api/vitals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(8 * 1024 + 1),
      },
      body: JSON.stringify({ name: 'CLS', value: 0.01 }),
    })

    const response = await POST(request)

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: 'Request body is too large' })
  })

  it('emits API latency as a structured server event', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const request = new Request('http://localhost/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'request-12345678' },
      body: JSON.stringify({
        name: 'api-latency',
        value: 875,
        path: '/api/bookings',
        status: 200,
        rating: 'needs-improvement',
      }),
    })

    const response = await POST(request)
    const logEntry = JSON.parse(String(warn.mock.calls[0]?.[0]))

    expect(response.status).toBe(200)
    expect(logEntry).toMatchObject({
      event: 'performance.api_latency',
      level: 'warn',
      requestId: 'request-12345678',
      context: {
        apiPath: '/api/bookings',
        durationMs: 875,
        status: 200,
        rating: 'needs-improvement',
      },
    })
  })
})
