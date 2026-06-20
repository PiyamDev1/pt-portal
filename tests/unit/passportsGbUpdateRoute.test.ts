import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const gbSingle = vi.fn()
  const gbEqLookup = vi.fn(() => ({ single: gbSingle }))
  const gbSelect = vi.fn(() => ({ eq: gbEqLookup }))
  const pricingMaybeSingle = vi.fn()
  const pricingEqLookup = vi.fn(() => ({ maybeSingle: pricingMaybeSingle }))
  const pricingSelect = vi.fn(() => ({ eq: pricingEqLookup }))

  const applicantsUpdateEq = vi.fn()
  const applicantsUpdate = vi.fn(() => ({ eq: applicantsUpdateEq }))

  const gbUpdateEq = vi.fn()
  const gbUpdate = vi.fn(() => ({ eq: gbUpdateEq }))

  const historyInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'british_passport_applications') {
      return { select: gbSelect, update: gbUpdate }
    }
    if (table === 'gb_passport_pricing') {
      return { select: pricingSelect }
    }
    if (table === 'applicants') {
      return { update: applicantsUpdate }
    }
    if (table === 'british_passport_status_history') {
      return { insert: historyInsert }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    gbSingle,
    gbSelect,
    gbEqLookup,
    pricingSelect,
    pricingEqLookup,
    pricingMaybeSingle,
    applicantsUpdate,
    applicantsUpdateEq,
    gbUpdate,
    gbUpdateEq,
    historyInsert,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/passports/gb/update/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/gb/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/passports/gb/update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.gbSelect.mockReturnValue({ eq: mocks.gbEqLookup })
    mocks.gbEqLookup.mockReturnValue({ single: mocks.gbSingle })
    mocks.pricingSelect.mockReturnValue({ eq: mocks.pricingEqLookup })
    mocks.pricingEqLookup.mockReturnValue({ maybeSingle: mocks.pricingMaybeSingle })
    mocks.applicantsUpdate.mockReturnValue({ eq: mocks.applicantsUpdateEq })
    mocks.gbUpdate.mockReturnValue({ eq: mocks.gbUpdateEq })
  })

  it('returns 500 when target application is not found', async () => {
    mocks.gbSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })

    const res = await POST(makeRequest({ id: 'gb-1' }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/application not found/i)
  })

  it('updates applicant and application and writes history when status changes', async () => {
    mocks.gbSingle.mockResolvedValue({
      data: {
        applicant_id: 'a-1',
        status: 'Pending',
        pricing_id: 'pricing-1',
        age_group: 'Adult',
        pages: '34',
        service_type: 'Standard',
      },
      error: null,
    })
    mocks.pricingMaybeSingle.mockResolvedValue({
      data: {
        id: 'pricing-1',
        cost_price: 100,
        sale_price: 120,
        age_group: 'Adult',
        pages: '34',
        service_type: 'Standard',
        is_active: true,
      },
      error: null,
    })
    mocks.applicantsUpdateEq.mockResolvedValue({ error: null })
    mocks.gbUpdateEq.mockResolvedValue({ error: null })
    mocks.historyInsert.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        id: 'gb-1',
        userId: 'u-1',
        applicantName: 'Jane Doe',
        applicantPassport: 'P-222',
        dateOfBirth: '1992-01-01',
        phoneNumber: '999',
        pexNumber: 'abc123',
        status: 'Approved',
        notes: 'ok',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ updatedPassportId: 'gb-1' })
    expect(mocks.gbUpdate).toHaveBeenCalledWith({
      pex_number: 'ABC123',
      status: 'Approved',
      pricing_id: 'pricing-1',
      cost_price: 100,
      sale_price: 120,
      age_group: 'Adult',
      pages: '34',
      service_type: 'Standard',
    })
    expect(mocks.historyInsert).toHaveBeenCalledWith({
      passport_id: 'gb-1',
      old_status: 'Pending',
      new_status: 'Approved',
      notes: 'ok',
      changed_by: 'u-1',
    })
  })

  it('does not write history when status is unchanged', async () => {
    mocks.gbSingle.mockResolvedValue({
      data: {
        applicant_id: 'a-1',
        status: 'Pending',
        pricing_id: 'pricing-1',
        age_group: 'Adult',
        pages: '34',
        service_type: 'Standard',
      },
      error: null,
    })
    mocks.pricingMaybeSingle.mockResolvedValue({
      data: {
        id: 'pricing-1',
        cost_price: 100,
        sale_price: 120,
        age_group: 'Adult',
        pages: '34',
        service_type: 'Standard',
        is_active: true,
      },
      error: null,
    })
    mocks.gbUpdateEq.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ id: 'gb-1', status: 'Pending' }))
    expect(res.status).toBe(200)
    expect(mocks.historyInsert).not.toHaveBeenCalled()
  })

  it('falls back to exact pricing lookup when pricing id is missing', async () => {
    mocks.gbSingle.mockResolvedValue({
      data: {
        applicant_id: 'a-1',
        status: 'Pending',
        pricing_id: null,
        age_group: 'Adult',
        pages: '34 Pages',
        service_type: 'Standard',
      },
      error: null,
    })
    mocks.pricingSelect.mockResolvedValue({
      data: [
        {
          id: 'pricing-2',
          cost_price: 110,
          sale_price: 140,
          age_group: 'Adult',
          pages: '34',
          service_type: 'Standard',
          is_active: true,
        },
      ],
      error: null,
    })
    mocks.gbUpdateEq.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        id: 'gb-1',
        status: 'Pending',
        ageGroup: 'Adult',
        pages: '34 Pages',
        serviceType: 'Standard',
      }),
    )
    expect(res.status).toBe(200)
    expect(mocks.pricingSelect).toHaveBeenCalled()
  })
})
