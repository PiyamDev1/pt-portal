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

import { PATCH, POST } from '@/app/api/travel-packages/[id]/operations/route'

const params = { params: Promise.resolve({ id: 'package-1' }) }
const handlers = [
  { name: 'create', method: 'POST' as const, invoke: POST },
  { name: 'update', method: 'PATCH' as const, invoke: PATCH },
]

describe('travel package operation request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
  })

  it.each(handlers)(
    'rejects malformed JSON for $name before package table access',
    async (route) => {
      const response = await route.invoke(
        new Request('http://localhost/api/travel-packages/package-1/operations', {
          method: route.method,
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        }) as never,
        params,
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
      expect(mocks.getUser).toHaveBeenCalledOnce()
      expect(mocks.from).not.toHaveBeenCalled()
    },
  )

  it.each(handlers)(
    'rejects an empty body for $name before package table access',
    async (route) => {
      const response = await route.invoke(
        new Request('http://localhost/api/travel-packages/package-1/operations', {
          method: route.method,
        }) as never,
        params,
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
      expect(mocks.getUser).toHaveBeenCalledOnce()
      expect(mocks.from).not.toHaveBeenCalled()
    },
  )
})
