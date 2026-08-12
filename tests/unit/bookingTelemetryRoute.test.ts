import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  enforceRateLimit: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
  logServerEvent: vi.fn(),
}))

vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: mocks.getClientIp,
}))
vi.mock('@/lib/observability/server', () => ({
  logServerEvent: mocks.logServerEvent,
}))

import { POST } from '@/app/api/bookings/telemetry/route'

const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/bookings/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/bookings/telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 119,
      retryAfterSeconds: 0,
    })
  })

  it('logs only allowlisted event metadata', async () => {
    const request = makeRequest({
      event: 'booking_status_error',
      metadata: {
        bookingId: 'booking-1',
        nextStatus: 'confirmed',
        statusCode: 409,
        customerEmail: 'must-not-be-logged@example.com',
      },
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true })
    expect(mocks.logServerEvent).toHaveBeenCalledWith({
      event: 'bookings.telemetry',
      request,
      context: {
        bookingEvent: 'booking_status_error',
        bookingId: 'booking-1',
        nextStatus: 'confirmed',
        statusCode: 409,
      },
    })
  })

  it('rejects unknown events', async () => {
    const response = await POST(makeRequest({ event: 'arbitrary', metadata: {} }))

    expect(response.status).toBe(400)
    expect(mocks.logServerEvent).not.toHaveBeenCalled()
  })

  it('returns the shared rate-limit response', async () => {
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: false,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
    })

    const response = await POST(makeRequest({ event: 'booking_created' }))

    expect(response.status).toBe(429)
    expect(mocks.logServerEvent).not.toHaveBeenCalled()
  })
})
