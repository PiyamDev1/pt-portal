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

import { PATCH, POST, PUT } from '@/app/api/travel-package-groups/[id]/shared-services/route'

const params = { params: Promise.resolve({ id: 'group-1' }) }

const routeCases = [
  { name: 'create service', method: 'POST' as const, invoke: POST },
  { name: 'update service or allocation', method: 'PATCH' as const, invoke: PATCH },
  { name: 'create service allocation', method: 'PUT' as const, invoke: PUT },
]

describe('travel package group shared service request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
  })

  it.each(routeCases)('rejects malformed JSON for $name before table access', async (route) => {
    const response = await route.invoke(
      new Request('http://localhost/api/travel-package-groups/group-1/shared-services', {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }) as never,
      params,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each(routeCases)('rejects an empty body for $name before table access', async (route) => {
    const response = await route.invoke(
      new Request('http://localhost/api/travel-package-groups/group-1/shared-services', {
        method: route.method,
      }) as never,
      params,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
