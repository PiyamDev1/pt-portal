import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const existingMaybeSingle = vi.fn()
  const selectEqModule = vi.fn(() => ({ maybeSingle: existingMaybeSingle }))
  const selectEqUser = vi.fn(() => ({ eq: selectEqModule }))
  const select = vi.fn(() => ({ eq: selectEqUser }))
  const upsertSingle = vi.fn()
  const upsertSelect = vi.fn(() => ({ single: upsertSingle }))
  const upsert = vi.fn(() => ({ select: upsertSelect }))
  const from = vi.fn(() => ({ select, upsert }))
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser }, from }))

  return {
    getUser,
    existingMaybeSingle,
    selectEqModule,
    selectEqUser,
    select,
    upsertSingle,
    upsertSelect,
    upsert,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { POST } from '@/app/api/dashboard/modules/route'

const makeRequest = (body: string) =>
  new Request('http://localhost/api/dashboard/modules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

describe('POST /api/dashboard/modules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff-1' } }, error: null })
    mocks.existingMaybeSingle.mockResolvedValue({
      data: { is_favorite: true, usage_count: 4, last_opened_at: null },
      error: null,
    })
    mocks.upsertSingle.mockResolvedValue({ data: { module_id: 'accounting' }, error: null })
  })

  it('records module usage for the authenticated user', async () => {
    const response = await POST(
      makeRequest(JSON.stringify({ moduleId: 'accounting', action: 'record-open' })),
    )

    expect(response.status).toBe(200)
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'staff-1',
        module_id: 'accounting',
        is_favorite: true,
        usage_count: 5,
        last_opened_at: expect.any(String),
      }),
      { onConflict: 'user_id,module_id' },
    )
  })

  it('rejects malformed JSON before reading or writing preferences', async () => {
    const response = await POST(makeRequest('{'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'moduleId and action required' })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('does not read or write preferences without a session', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })

    const response = await POST(
      makeRequest(JSON.stringify({ moduleId: 'accounting', action: 'record-open' })),
    )

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
