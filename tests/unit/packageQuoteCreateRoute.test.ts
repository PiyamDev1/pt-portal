import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const insertSingle = vi.fn()
  const insertSelect = vi.fn(() => ({ single: insertSingle }))
  const insert = vi.fn(() => ({ select: insertSelect }))
  const from = vi.fn(() => ({ insert }))
  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return { getUser, insertSingle, insert, from, getRouteSupabaseClient }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { POST } from '@/app/api/packages/route'

describe('POST /api/packages request body', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.insertSingle.mockResolvedValue({ data: { id: 'quote-1' }, error: null })
  })

  it('rejects malformed JSON before inserting a quote', async () => {
    const response = await POST(
      new Request('http://localhost/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      }) as never,
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid JSON body' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('keeps empty input as a default draft quote', async () => {
    const response = await POST(
      new Request('http://localhost/api/packages', { method: 'POST' }) as never,
    )

    expect(response.status).toBe(201)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New package quote',
        status: 'draft',
        created_by: 'agent-1',
      }),
    )
  })
})
