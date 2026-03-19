import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const selectEq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: selectEq }))

  const updateMaybeSingle = vi.fn()
  const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }))
  const updateEq = vi.fn(() => ({ select: updateSelect }))
  const update = vi.fn(() => ({ eq: updateEq }))

  const from = vi.fn(() => ({ select, update }))
  const createClient = vi.fn(() => ({ from }))

  return {
    maybeSingle,
    selectEq,
    select,
    updateMaybeSingle,
    updateSelect,
    updateEq,
    update,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { GET, POST } from '@/app/api/passports/pak/notes/route'

const makeGetRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/passports/pak/notes')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString())
}

const makePostRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/pak/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('PAK passport notes route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ select: mocks.select, update: mocks.update })
    mocks.select.mockReturnValue({ eq: mocks.selectEq })
    mocks.selectEq.mockReturnValue({ maybeSingle: mocks.maybeSingle })
    mocks.update.mockReturnValue({ eq: mocks.updateEq })
    mocks.updateEq.mockReturnValue({ select: mocks.updateSelect })
    mocks.updateSelect.mockReturnValue({ maybeSingle: mocks.updateMaybeSingle })
  })

  it('GET returns 400 when applicationId is missing', async () => {
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(400)
  })

  it('GET returns empty notes when no record exists', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await GET(makeGetRequest({ applicationId: 'app-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.notes).toBe('')
  })

  it('POST returns 400 when notes is not a string', async () => {
    const res = await POST(makePostRequest({ applicationId: 'app-1', notes: 123 }))
    expect(res.status).toBe(400)
  })

  it('POST returns 404 when update finds no record', async () => {
    mocks.updateMaybeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(makePostRequest({ applicationId: 'app-1', notes: 'abc', userId: 'u-1' }))
    expect(res.status).toBe(404)
  })

  it('POST returns 200 and saved notes on success', async () => {
    mocks.updateMaybeSingle.mockResolvedValue({ data: { id: 'p-1', notes: 'saved' }, error: null })
    const res = await POST(
      makePostRequest({ applicationId: 'app-1', notes: ' saved ', userId: 'u-1' }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ updatedPassportId: 'p-1', notes: 'saved' })
  })
})
