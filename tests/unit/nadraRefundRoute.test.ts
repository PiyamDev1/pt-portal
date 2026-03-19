import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const selectSingle = vi.fn()
  const selectEq = vi.fn(() => ({ single: selectSingle }))
  const select = vi.fn(() => ({ eq: selectEq }))

  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))

  const historyInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'nadra_services') {
      return { select, update }
    }
    if (table === 'nadra_status_history') {
      return { insert: historyInsert }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    selectSingle,
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

import { POST } from '@/app/api/nadra/refund/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/nadra/refund', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/nadra/refund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'nadra_services') return { select: mocks.select, update: mocks.update }
      if (table === 'nadra_status_history') return { insert: mocks.historyInsert }
      return {}
    })
    mocks.select.mockReturnValue({ eq: mocks.selectEq })
    mocks.selectEq.mockReturnValue({ single: mocks.selectSingle })
    mocks.update.mockReturnValue({ eq: mocks.updateEq })
  })

  it('returns 400 when nadraId is missing', async () => {
    const res = await POST(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing nadra id/i)
  })

  it('returns 404 when service is not found', async () => {
    mocks.selectSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    const res = await POST(makeRequest({ nadraId: 'n-1', userId: 'u-1' }))
    expect(res.status).toBe(404)
  })

  it('returns 400 when status is not cancelled', async () => {
    mocks.selectSingle.mockResolvedValue({
      data: { id: 'n-1', status: 'Processing', is_refunded: false },
      error: null,
    })
    const res = await POST(makeRequest({ nadraId: 'n-1', userId: 'u-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/only cancelled/i)
  })

  it('returns alreadyRefunded when item is already refunded', async () => {
    mocks.selectSingle.mockResolvedValue({
      data: { id: 'n-1', status: 'Cancelled', is_refunded: true },
      error: null,
    })

    const res = await POST(makeRequest({ nadraId: 'n-1', userId: 'u-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alreadyRefunded).toBe(true)
    expect(typeof body.refundedAt).toBe('string')
  })

  it('returns 200 when refund update and history insert succeed', async () => {
    mocks.selectSingle.mockResolvedValue({
      data: { id: 'n-1', status: 'Cancelled', is_refunded: false },
      error: null,
    })
    mocks.updateEq.mockResolvedValue({ error: null })
    mocks.historyInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ nadraId: 'n-1', userId: 'u-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.refundedAt).toBe('string')
    expect(body.alreadyRefunded).toBeUndefined()
  })
})
