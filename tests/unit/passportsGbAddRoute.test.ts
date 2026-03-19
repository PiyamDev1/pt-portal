import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const pricingSingle = vi.fn()
  const pricingEqService = vi.fn(() => ({ single: pricingSingle }))
  const pricingEqPages = vi.fn(() => ({ eq: pricingEqService }))
  const pricingEqAge = vi.fn(() => ({ eq: pricingEqPages }))
  const pricingSelect = vi.fn(() => ({ eq: pricingEqAge }))

  const applicantMaybeSingle = vi.fn()
  const applicantEqPassport = vi.fn(() => ({ maybeSingle: applicantMaybeSingle }))
  const applicantSelect = vi.fn(() => ({ eq: applicantEqPassport }))
  const applicantUpdateEq = vi.fn()
  const applicantUpdate = vi.fn(() => ({ eq: applicantUpdateEq }))
  const applicantInsertSingle = vi.fn()
  const applicantInsertSelect = vi.fn(() => ({ single: applicantInsertSingle }))
  const applicantInsert = vi.fn(() => ({ select: applicantInsertSelect }))

  const appInsertSingle = vi.fn()
  const appInsertSelect = vi.fn(() => ({ single: appInsertSingle }))
  const appInsert = vi.fn(() => ({ select: appInsertSelect }))

  const gbInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'gb_passport_pricing') return { select: pricingSelect }
    if (table === 'applicants') {
      return { select: applicantSelect, update: applicantUpdate, insert: applicantInsert }
    }
    if (table === 'applications') return { insert: appInsert }
    if (table === 'british_passport_applications') return { insert: gbInsert }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    pricingSingle,
    pricingSelect,
    pricingEqAge,
    pricingEqPages,
    pricingEqService,
    applicantMaybeSingle,
    applicantSelect,
    applicantEqPassport,
    applicantUpdate,
    applicantUpdateEq,
    applicantInsert,
    applicantInsertSelect,
    applicantInsertSingle,
    appInsert,
    appInsertSelect,
    appInsertSingle,
    gbInsert,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/passports/gb/add/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/gb/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const baseBody = {
  applicantName: 'John Doe',
  applicantPassport: 'P-123',
  dateOfBirth: '1990-01-01',
  phoneNumber: '12345',
  pexNumber: 'pex1',
  ageGroup: 'Adult',
  serviceType: 'Fast Track',
  pages: '34',
  currentUserId: 'u-1',
}

describe('POST /api/passports/gb/add', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.pricingSelect.mockReturnValue({ eq: mocks.pricingEqAge })
    mocks.pricingEqAge.mockReturnValue({ eq: mocks.pricingEqPages })
    mocks.pricingEqPages.mockReturnValue({ eq: mocks.pricingEqService })
    mocks.pricingEqService.mockReturnValue({ single: mocks.pricingSingle })

    mocks.applicantSelect.mockReturnValue({ eq: mocks.applicantEqPassport })
    mocks.applicantEqPassport.mockReturnValue({ maybeSingle: mocks.applicantMaybeSingle })
    mocks.applicantUpdate.mockReturnValue({ eq: mocks.applicantUpdateEq })
    mocks.applicantInsert.mockReturnValue({ select: mocks.applicantInsertSelect })
    mocks.applicantInsertSelect.mockReturnValue({ single: mocks.applicantInsertSingle })
    mocks.appInsert.mockReturnValue({ select: mocks.appInsertSelect })
    mocks.appInsertSelect.mockReturnValue({ single: mocks.appInsertSingle })
  })

  it('returns 500 when pricing is missing', async () => {
    mocks.pricingSingle.mockResolvedValue({ data: null, error: { message: 'no pricing' } })

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/pricing not found/i)
  })

  it('creates records successfully when applicant exists', async () => {
    mocks.pricingSingle.mockResolvedValue({
      data: { id: 'pr-1', cost_price: 80, sale_price: 120 },
      error: null,
    })
    mocks.applicantMaybeSingle.mockResolvedValue({ data: { id: 'a-1' }, error: null })
    mocks.applicantUpdateEq.mockResolvedValue({ error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'app-1' }, error: null })
    mocks.gbInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ applicantId: 'a-1', applicationId: 'app-1' })
    expect(mocks.gbInsert).toHaveBeenCalled()
  })

  it('creates applicant when not found', async () => {
    mocks.pricingSingle.mockResolvedValue({
      data: { id: 'pr-1', cost_price: 80, sale_price: 120 },
      error: null,
    })
    mocks.applicantMaybeSingle.mockResolvedValue({ data: null, error: null })
    mocks.applicantInsertSingle.mockResolvedValue({ data: { id: 'a-new' }, error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'app-1' }, error: null })
    mocks.gbInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(baseBody))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ applicantId: 'a-new', applicationId: 'app-1' })
    expect(mocks.applicantInsert).toHaveBeenCalled()
  })
})
