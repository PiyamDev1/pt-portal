import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const from = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return { getUser, from, getRouteSupabaseClient }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/packageAudit', () => ({ recordPackageAuditEvent: vi.fn() }))
vi.mock('@/lib/packagePaymentsServer', () => ({ syncPackagePaymentStatus: vi.fn() }))

import { PATCH } from '@/app/api/travel-packages/[id]/route'

const params = { params: Promise.resolve({ id: 'package-1' }) }

describe('PATCH /api/travel-packages/[id] request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
  })

  it.each([
    ['malformed', '{'],
    ['empty', undefined],
  ])('rejects a %s package update before package lookups', async (_kind, body) => {
    const response = await PATCH(
      new Request('http://localhost/api/travel-packages/package-1', {
        method: 'PATCH',
        ...(body === undefined ? {} : { body }),
      }) as never,
      params,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.getRouteSupabaseClient).toHaveBeenCalledOnce()
    expect(mocks.getUser).toHaveBeenCalledOnce()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
