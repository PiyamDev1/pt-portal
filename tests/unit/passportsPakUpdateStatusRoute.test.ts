import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const single = vi.fn()
  const selectEq = vi.fn(() => ({ single }))
  const select = vi.fn(() => ({ eq: selectEq }))

  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))

  const historyInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'pakistani_passport_applications') return { select, update }
    if (table === 'pakistani_passport_status_history') return { insert: historyInsert }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    single,
    selectEq,
    select,
    updateEq,
    update,
    historyInsert,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/passports/pak/update-status/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/pak/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/passports/pak/update-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'pakistani_passport_applications')
        return { select: mocks.select, update: mocks.update }
      if (table === 'pakistani_passport_status_history') return { insert: mocks.historyInsert }
      return {}
    })
    mocks.select.mockReturnValue({ eq: mocks.selectEq })
    mocks.selectEq.mockReturnValue({ single: mocks.single })
    mocks.update.mockReturnValue({ eq: mocks.updateEq })
  })

  it('returns 400 when passportId or status is missing', async () => {
    const res = await POST(makeRequest({ passportId: 'p-1' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid status value', async () => {
    const res = await POST(makeRequest({ passportId: 'p-1', status: 'NotAStatus' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when Collected has no passport number in request or DB', async () => {
    mocks.single.mockResolvedValue({ data: { new_passport_number: null }, error: null })
    const res = await POST(makeRequest({ passportId: 'p-1', status: 'Collected' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/cannot mark collected/i)
  })

  it('returns 500 when update fails', async () => {
    mocks.updateEq.mockResolvedValue({ error: { message: 'db failed' } })
    const res = await POST(makeRequest({ passportId: 'p-1', status: 'Approved', userId: 'u-1' }))
    expect(res.status).toBe(500)
  })

  it('returns 200 on successful update and history insert', async () => {
    mocks.updateEq.mockResolvedValue({ error: null })
    mocks.historyInsert.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        passportId: 'p-1',
        status: 'Approved',
        userId: 'u-1',
        newPassportNo: 'P-999',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ updatedPassportId: 'p-1', status: 'Approved' })
    expect(mocks.historyInsert).toHaveBeenCalledWith({
      passport_application_id: 'p-1',
      new_status: 'Approved',
      changed_by: 'u-1',
    })
  })
})
