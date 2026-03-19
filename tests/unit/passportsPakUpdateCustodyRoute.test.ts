import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))

  const single = vi.fn()
  const selectEq = vi.fn(() => ({ single }))
  const select = vi.fn(() => ({ eq: selectEq }))

  const from = vi.fn(() => ({ update, select }))
  const createClient = vi.fn(() => ({ from }))

  return { updateEq, update, single, selectEq, select, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/passports/pak/update-custody/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/pak/update-custody', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  })

describe('POST /api/passports/pak/update-custody', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ update: mocks.update, select: mocks.select })
    mocks.update.mockReturnValue({ eq: mocks.updateEq })
    mocks.select.mockReturnValue({ eq: mocks.selectEq })
    mocks.selectEq.mockReturnValue({ single: mocks.single })
  })

  it('returns 400 for missing fields', async () => {
    const res = await POST(makeRequest({ action: 'return_old' }))
    expect(res.status).toBe(400)
  })

  it('handles return_old action successfully', async () => {
    mocks.updateEq.mockResolvedValue({ error: null })
    const res = await POST(makeRequest({ passportId: 'p-1', action: 'return_old', userId: 'u-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ updatedPassportId: 'p-1', action: 'return_old' })
  })

  it('requires newNumber for record_new action', async () => {
    const res = await POST(makeRequest({ passportId: 'p-1', action: 'record_new' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/new passport number required/i)
  })

  it('toggles fingerprints and returns updated value', async () => {
    mocks.single.mockResolvedValue({ data: { fingerprints_completed: false }, error: null })
    mocks.updateEq.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ passportId: 'p-1', action: 'toggle_fingerprints' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.fingerprints_completed).toBe(true)
  })

  it('returns 400 for unknown action', async () => {
    const res = await POST(makeRequest({ passportId: 'p-1', action: 'other' }))
    expect(res.status).toBe(400)
  })
})
