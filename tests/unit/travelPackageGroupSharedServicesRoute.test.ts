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
import { POST as createGroup } from '@/app/api/travel-package-groups/route'
import { PATCH as updateGroup } from '@/app/api/travel-package-groups/[id]/route'
import {
  PATCH as updateGroupMember,
  POST as createGroupMember,
} from '@/app/api/travel-package-groups/[id]/members/route'

const params = { params: Promise.resolve({ id: 'group-1' }) }

type GroupRouteCase = {
  name: string
  url: string
  method: 'POST' | 'PATCH' | 'PUT'
  invoke: (request: Request) => Promise<Response>
}

const routeCases: GroupRouteCase[] = [
  {
    name: 'create service',
    url: 'http://localhost/api/travel-package-groups/group-1/shared-services',
    method: 'POST',
    invoke: (request) => POST(request as never, params),
  },
  {
    name: 'update service or allocation',
    url: 'http://localhost/api/travel-package-groups/group-1/shared-services',
    method: 'PATCH',
    invoke: (request) => PATCH(request as never, params),
  },
  {
    name: 'create service allocation',
    url: 'http://localhost/api/travel-package-groups/group-1/shared-services',
    method: 'PUT',
    invoke: (request) => PUT(request as never, params),
  },
  {
    name: 'create group',
    url: 'http://localhost/api/travel-package-groups',
    method: 'POST',
    invoke: (request) => createGroup(request as never),
  },
  {
    name: 'update group',
    url: 'http://localhost/api/travel-package-groups/group-1',
    method: 'PATCH',
    invoke: (request) => updateGroup(request as never, params),
  },
  {
    name: 'add group member',
    url: 'http://localhost/api/travel-package-groups/group-1/members',
    method: 'POST',
    invoke: (request) => createGroupMember(request as never, params),
  },
  {
    name: 'update group member',
    url: 'http://localhost/api/travel-package-groups/group-1/members',
    method: 'PATCH',
    invoke: (request) => updateGroupMember(request as never, params),
  },
]

describe('travel package group shared service request bodies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
  })

  it.each(routeCases)('rejects malformed JSON for $name before table access', async (route) => {
    const response = await route.invoke(
      new Request(route.url, {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it.each(routeCases)('rejects an empty body for $name before table access', async (route) => {
    const response = await route.invoke(
      new Request(route.url, {
        method: route.method,
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
