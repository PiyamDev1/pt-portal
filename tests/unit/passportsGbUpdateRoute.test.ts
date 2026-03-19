import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const gbSingle = vi.fn()
  const gbEqLookup = vi.fn(() => ({ single: gbSingle }))
  const gbSelect = vi.fn(() => ({ eq: gbEqLookup }))

  const applicantsUpdateEq = vi.fn()
  const applicantsUpdate = vi.fn(() => ({ eq: applicantsUpdateEq }))

  const gbUpdateEq = vi.fn()
  const gbUpdate = vi.fn(() => ({ eq: gbUpdateEq }))

  const historyInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'british_passport_applications') {
      return { select: gbSelect, update: gbUpdate }
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
      data: { applicant_id: 'a-1', status: 'Pending' },
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
      data: { applicant_id: 'a-1', status: 'Pending' },
      error: null,
    })
    mocks.gbUpdateEq.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ id: 'gb-1', status: 'Pending' }))
    expect(res.status).toBe(200)
    expect(mocks.historyInsert).not.toHaveBeenCalled()
  })
})
