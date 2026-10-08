import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const from = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ from }))
  return { from, getRouteSupabaseClient }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { PATCH, POST } from '@/app/api/bookings/waitlist/route'

describe('booking waitlist request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['POST', POST, '{'],
    ['POST', POST, ''],
    ['PATCH', PATCH, '{'],
    ['PATCH', PATCH, ''],
  ] as const)(
    'rejects malformed or empty JSON for %s before database access',
    async (method, handler, body) => {
      const response = await handler(
        new Request('http://localhost/api/bookings/waitlist', {
          method,
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body || undefined,
        }) as never,
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid JSON request body' })
      expect(mocks.getRouteSupabaseClient).not.toHaveBeenCalled()
      expect(mocks.from).not.toHaveBeenCalled()
    },
  )
})
