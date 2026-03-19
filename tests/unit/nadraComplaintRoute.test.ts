import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const serviceSingle = vi.fn()
  const serviceEq = vi.fn(() => ({ single: serviceSingle }))
  const serviceSelect = vi.fn(() => ({ eq: serviceEq }))

  const historyInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'nadra_services') return { select: serviceSelect }
    if (table === 'nadra_status_history') return { insert: historyInsert }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))
  return { serviceSingle, serviceEq, serviceSelect, historyInsert, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/nadra/complaint/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/nadra/complaint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/nadra/complaint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'nadra_services') return { select: mocks.serviceSelect }
      if (table === 'nadra_status_history') return { insert: mocks.historyInsert }
      return {}
    })
    mocks.serviceSelect.mockReturnValue({ eq: mocks.serviceEq })
    mocks.serviceEq.mockReturnValue({ single: mocks.serviceSingle })
  })

  it('returns 400 when nadraId is missing', async () => {
    const res = await POST(makeRequest({ complaintNumber: 'C-1', details: 'x', userId: 'u-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing nadra id/i)
  })

  it('returns 400 when complaint number is missing', async () => {
    const res = await POST(makeRequest({ nadraId: 'n-1', details: 'x', userId: 'u-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/complaint number is required/i)
  })

  it('returns 404 when nadra service is not found', async () => {
    mocks.serviceSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(
      makeRequest({ nadraId: 'n-1', complaintNumber: 'C-1', details: 'x', userId: 'u-1' }),
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/not found/i)
  })

  it('returns 200 and writes complaint history on success', async () => {
    mocks.serviceSingle.mockResolvedValue({ data: { id: 'n-1', status: 'Pending' }, error: null })
    mocks.historyInsert.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        nadraId: 'n-1',
        complaintNumber: '  C-123  ',
        details: '  details here  ',
        userId: 'u-1',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      complaintRecordedForNadraId: 'n-1',
      complaintNumber: 'C-123',
    })
    expect(mocks.historyInsert).toHaveBeenCalledWith({
      nadra_service_id: 'n-1',
      new_status: 'Pending',
      changed_by: 'u-1',
      entry_type: 'complaint',
      complaint_number: 'C-123',
      details: 'details here',
    })
  })
})
