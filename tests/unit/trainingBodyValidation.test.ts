import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const maybeSingle = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser }, from }))
  return { getUser, maybeSingle, from, getRouteSupabaseClient }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { POST } from '@/app/api/training/route'

describe('Training mutation JSON boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'employee-1' } } })
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: 'employee-1',
        full_name: 'Training User',
        email: 'training@example.com',
        roles: { name: 'Employee' },
        locations: null,
      },
      error: null,
    })
  })

  it.each([
    ['malformed JSON', '{', 'Invalid JSON request body'],
    ['an empty body', undefined, 'Training action is required'],
  ])('keeps %s on a non-mutating 400 path', async (_label, body, error) => {
    const response = await POST(
      new Request('http://localhost/api/training', {
        method: 'POST',
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body,
      }),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error })
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(['employees'])
  })

  it('keeps the authentication gate ahead of profile access and body handling', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await POST(
      new Request('http://localhost/api/training', { method: 'POST', body: '{' }),
    )

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
