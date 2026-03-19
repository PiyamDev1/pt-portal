import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const applicantSingle = vi.fn()
  const applicantEq = vi.fn(() => ({ single: applicantSingle }))
  const applicantSelect = vi.fn(() => ({ eq: applicantEq }))

  const applicantInsertSingle = vi.fn()
  const applicantInsertSelect = vi.fn(() => ({ single: applicantInsertSingle }))
  const applicantInsert = vi.fn(() => ({ select: applicantInsertSelect }))

  const visaInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'applicants') {
      return { select: applicantSelect, insert: applicantInsert }
    }
    if (table === 'visa_applications') {
      return { insert: visaInsert }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    applicantSingle,
    applicantEq,
    applicantSelect,
    applicantInsertSingle,
    applicantInsertSelect,
    applicantInsert,
    visaInsert,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/visas/add-application/route'

const basePayload = {
  applicantName: 'John Doe',
  applicantPassport: 'P1234567',
  countryId: 1,
  visaTypeId: 10,
  customerPrice: 150,
  basePrice: 100,
  costCurrency: 'GBP',
  notes: 'test notes',
  internalTrackingNo: 'VISA-001',
  currentUserId: 'u-1',
}

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/visas/add-application', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/visas/add-application', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'applicants') return { select: mocks.applicantSelect, insert: mocks.applicantInsert }
      if (table === 'visa_applications') return { insert: mocks.visaInsert }
      return {}
    })
    mocks.applicantSelect.mockReturnValue({ eq: mocks.applicantEq })
    mocks.applicantEq.mockReturnValue({ single: mocks.applicantSingle })
    mocks.applicantInsert.mockReturnValue({ select: mocks.applicantInsertSelect })
    mocks.applicantInsertSelect.mockReturnValue({ single: mocks.applicantInsertSingle })
  })

  it('uses existing applicant when found by passport', async () => {
    mocks.applicantSingle.mockResolvedValue({ data: { id: 'a-1' } })
    mocks.visaInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(basePayload))
    expect(res.status).toBe(200)
    expect(mocks.applicantInsert).not.toHaveBeenCalled()
  })

  it('creates applicant when not found, then inserts application', async () => {
    mocks.applicantSingle.mockResolvedValue({ data: null })
    mocks.applicantInsertSingle.mockResolvedValue({ data: { id: 'a-new' }, error: null })
    mocks.visaInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(basePayload))
    expect(res.status).toBe(200)
    expect(mocks.applicantInsert).toHaveBeenCalled()
    expect(mocks.visaInsert).toHaveBeenCalled()
  })

  it('returns 500 when applicant creation fails', async () => {
    mocks.applicantSingle.mockResolvedValue({ data: null })
    mocks.applicantInsertSingle.mockResolvedValue({
      data: null,
      error: { message: 'insert applicant failed' },
    })

    const res = await POST(makeRequest(basePayload))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/applicant creation failed/i)
  })

  it('returns 500 when visa application insert fails', async () => {
    mocks.applicantSingle.mockResolvedValue({ data: { id: 'a-1' } })
    mocks.visaInsert.mockResolvedValue({ error: { message: 'visa insert failed' } })

    const res = await POST(makeRequest(basePayload))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/visa insert failed/i)
  })
})
