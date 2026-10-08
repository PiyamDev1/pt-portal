import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const from = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser }, from }))
  return { getUser, from, getRouteSupabaseClient }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { PATCH as patchSecurityPreferences } from '@/app/api/auth/security-preferences/route'
import { PATCH as patchBookingDraft } from '@/app/api/bookings/drafts/route'
import { PATCH as patchBookingPreferences } from '@/app/api/bookings/preferences/route'

const bodyHandlers = [
  { label: 'security preferences', handler: patchSecurityPreferences, authenticatesFirst: true },
  { label: 'booking drafts', handler: patchBookingDraft, authenticatesFirst: false },
  { label: 'booking preferences', handler: patchBookingPreferences, authenticatesFirst: false },
]

describe('account and booking preference request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee-1' } } })
  })

  it.each(bodyHandlers)(
    'rejects malformed and empty JSON for $label before any write',
    async ({ handler, authenticatesFirst }) => {
      for (const body of ['{', '']) {
        const response = await handler(
          new Request('http://localhost/api/preferences', {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: body || undefined,
          }) as never,
        )

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({ error: 'Invalid JSON request body' })
      }

      expect(mocks.getRouteSupabaseClient).toHaveBeenCalledTimes(authenticatesFirst ? 2 : 0)
      expect(mocks.from).not.toHaveBeenCalled()
    },
  )

  it('keeps authentication ahead of parsing security preference updates', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await patchSecurityPreferences(
      new Request('http://localhost/api/auth/security-preferences', {
        method: 'PATCH',
        body: '{',
      }) as never,
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'Unauthorized' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
