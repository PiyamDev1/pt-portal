import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const appMaybeSingle = vi.fn()
  const appEqPassport = vi.fn(() => ({ maybeSingle: appMaybeSingle }))
  const appSelect = vi.fn(() => ({ eq: appEqPassport }))

  const appInsertSingle = vi.fn()
  const appInsertSelect = vi.fn(() => ({ single: appInsertSingle }))
  const appInsert = vi.fn(() => ({ select: appInsertSelect }))
  const appUpdateEq = vi.fn()
  const appUpdate = vi.fn(() => ({ eq: appUpdateEq }))

  const visaInsert = vi.fn()
  const visaUpdateEq = vi.fn()
  const visaUpdate = vi.fn(() => ({ eq: visaUpdateEq }))

  const from = vi.fn((table: string) => {
    if (table === 'applicants') return { select: appSelect, insert: appInsert, update: appUpdate }
    if (table === 'visa_applications') return { insert: visaInsert, update: visaUpdate }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))
  return {
    appMaybeSingle,
    appEqPassport,
    appSelect,
    appInsertSingle,
    appInsertSelect,
    appInsert,
    appUpdate,
    appUpdateEq,
    visaInsert,
    visaUpdate,
    visaUpdateEq,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/visas/save/route'

const baseBody = {
  applicantName: 'John Doe',
  applicantPassport: 'P12345',
  applicantDob: '1990-01-01',
  applicantNationality: 'Pakistani',
  countryId: 1,
  validity: '30 days',
  internalTrackingNo: 'TRK-1',
  customerPrice: 100,
  basePrice: 80,
  costCurrency: 'GBP',
  isPartOfPackage: false,
  currentUserId: 'u-1',
  status: 'Pending',
}

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/visas/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/visas/save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'applicants') {
        return { select: mocks.appSelect, insert: mocks.appInsert, update: mocks.appUpdate }
      }
      if (table === 'visa_applications') return { insert: mocks.visaInsert, update: mocks.visaUpdate }
      return {}
    })

    mocks.appSelect.mockReturnValue({ eq: mocks.appEqPassport })
    mocks.appEqPassport.mockReturnValue({ maybeSingle: mocks.appMaybeSingle })
    mocks.appInsert.mockReturnValue({ select: mocks.appInsertSelect })
    mocks.appInsertSelect.mockReturnValue({ single: mocks.appInsertSingle })
    mocks.appUpdate.mockReturnValue({ eq: mocks.appUpdateEq })
    mocks.visaUpdate.mockReturnValue({ eq: mocks.visaUpdateEq })
  })

  it('returns 400 when countryId is invalid', async () => {
    const res = await POST(makeRequest({ ...baseBody, countryId: 'abc' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/valid country/i)
  })

  it('inserts new applicant and visa application when id is missing', async () => {
    mocks.appMaybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'a-1' }, error: null })
    mocks.visaInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ operation: 'created' })
    expect(mocks.visaInsert).toHaveBeenCalled()
  })

  it('updates existing application when id is provided', async () => {
    mocks.appMaybeSingle.mockResolvedValue({ data: { id: 'a-existing' }, error: null })
    mocks.appUpdateEq.mockResolvedValue({ error: null })
    mocks.visaUpdateEq.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ ...baseBody, id: 'visa-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ operation: 'updated' })
    expect(mocks.visaUpdateEq).toHaveBeenCalledWith('id', 'visa-1')
  })

  it('returns 500 when visa update fails', async () => {
    mocks.appMaybeSingle.mockResolvedValue({ data: { id: 'a-existing' }, error: null })
    mocks.appUpdateEq.mockResolvedValue({ error: null })
    mocks.visaUpdateEq.mockResolvedValue({ error: { message: 'update failed' } })

    const res = await POST(makeRequest({ ...baseBody, id: 'visa-1' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/update failed/i)
  })
})
