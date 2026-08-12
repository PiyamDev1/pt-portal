import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  getSupabaseClient: vi.fn(),
  getRouteSupabaseClient: vi.fn(),
}))

vi.mock('@/lib/adminSessionAuth', () => ({
  requireAdminSession: mocks.requireAdminSession,
}))
vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))
vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { PATCH as patchBranch } from '@/app/api/bookings/settings/branch/route'
import { PATCH as patchReminders } from '@/app/api/bookings/settings/reminders/route'
import { POST as createService } from '@/app/api/bookings/settings/services/route'
import {
  DELETE as deleteService,
  PATCH as patchService,
} from '@/app/api/bookings/settings/services/[id]/route'
import { POST as createOverride } from '@/app/api/bookings/settings/overrides/route'
import { DELETE as deleteOverride } from '@/app/api/bookings/settings/overrides/[id]/route'

const request = (method: string) =>
  new Request('http://localhost/api/bookings/settings/test', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'DELETE' ? undefined : JSON.stringify({}),
  })

const params = { params: Promise.resolve({ id: 'record-1' }) }

describe('booking settings mutation authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireAdminSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Forbidden' }, { status: 403 }),
    })
  })

  it.each([
    ['PATCH branch settings', () => patchBranch(request('PATCH') as never)],
    ['PATCH reminder settings', () => patchReminders(request('PATCH') as never)],
    ['POST service', () => createService(request('POST') as never)],
    ['PATCH service', () => patchService(request('PATCH') as never, params)],
    ['DELETE service', () => deleteService(request('DELETE') as never, params)],
    ['POST override', () => createOverride(request('POST') as never)],
    ['DELETE override', () => deleteOverride(request('DELETE') as never, params)],
  ])('requires an admin session for %s', async (_label, callRoute) => {
    const response = await callRoute()

    expect(response.status).toBe(403)
    expect(mocks.getSupabaseClient).not.toHaveBeenCalled()
    expect(mocks.getRouteSupabaseClient).not.toHaveBeenCalled()
  })
})
