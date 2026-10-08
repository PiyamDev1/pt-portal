import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getRouteSupabaseClient: vi.fn(),
  sendBookingEmail: vi.fn(),
}))

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/bookingEmail', () => ({
  customerPortalAccessEmailBlock: vi.fn(),
  defaultTemplate: vi.fn(),
  sendBookingEmail: mocks.sendBookingEmail,
}))

import { POST } from '@/app/api/bookings/route'

describe('POST /api/bookings request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['malformed', '{'],
    ['empty', undefined],
  ])('rejects a %s request before database access', async (_kind, body) => {
    const response = await POST(
      new Request('http://localhost/api/bookings', {
        method: 'POST',
        ...(body === undefined ? {} : { body }),
      }) as never,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      success: false,
      error: 'Invalid JSON request body',
    })
    expect(mocks.getRouteSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.sendBookingEmail).not.toHaveBeenCalled()
  })
})
