import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const applicantMaybeSingle = vi.fn()
  const applicantSingle = vi.fn()
  const applicantSelectEq = vi.fn(() => ({
    maybeSingle: applicantMaybeSingle,
    single: applicantSingle,
  }))
  const applicantSelect = vi.fn(() => ({ eq: applicantSelectEq }))
  const applicantUpdateEq = vi.fn()
  const applicantUpdate = vi.fn(() => ({ eq: applicantUpdateEq }))
  const applicantInsertSingle = vi.fn()
  const applicantInsertSelect = vi.fn(() => ({ single: applicantInsertSingle }))
  const applicantInsert = vi.fn(() => ({ select: applicantInsertSelect }))

  const appInsertSingle = vi.fn()
  const appInsertSelect = vi.fn(() => ({ single: appInsertSingle }))
  const appInsert = vi.fn(() => ({ select: appInsertSelect }))

  const nadraInsertSingle = vi.fn()
  const nadraInsertSelect = vi.fn(() => ({ single: nadraInsertSingle }))
  const nadraInsert = vi.fn(() => ({ select: nadraInsertSelect }))

  const nicopInsert = vi.fn()
  const historyInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'applicants') {
      return { select: applicantSelect, update: applicantUpdate, insert: applicantInsert }
    }
    if (table === 'applications') return { insert: appInsert }
    if (table === 'nadra_services') return { insert: nadraInsert }
    if (table === 'nicop_cnic_details') return { insert: nicopInsert }
    if (table === 'nadra_status_history') return { insert: historyInsert }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    applicantMaybeSingle,
    applicantSingle,
    applicantSelect,
    applicantSelectEq,
    applicantUpdate,
    applicantUpdateEq,
    applicantInsert,
    applicantInsertSingle,
    applicantInsertSelect,
    appInsert,
    appInsertSingle,
    appInsertSelect,
    nadraInsert,
    nadraInsertSingle,
    nadraInsertSelect,
    nicopInsert,
    historyInsert,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/nadra/add-application/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/nadra/add-application', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const baseBody = {
  applicantCnic: '12345-1234567-1',
  applicantName: 'John Doe',
  applicantEmail: 'john@example.com',
  serviceType: 'NICOP',
  serviceOption: 'Normal',
  trackingNumber: 'TRK-123',
  pin: '9876',
  currentUserId: 'emp-1',
}

describe('POST /api/nadra/add-application', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.applicantSelect.mockReturnValue({ eq: mocks.applicantSelectEq })
    mocks.applicantSelectEq.mockReturnValue({
      maybeSingle: mocks.applicantMaybeSingle,
      single: mocks.applicantSingle,
    })
    mocks.applicantUpdate.mockReturnValue({ eq: mocks.applicantUpdateEq })
    mocks.applicantInsert.mockReturnValue({ select: mocks.applicantInsertSelect })
    mocks.applicantInsertSelect.mockReturnValue({ single: mocks.applicantInsertSingle })

    mocks.appInsert.mockReturnValue({ select: mocks.appInsertSelect })
    mocks.appInsertSelect.mockReturnValue({ single: mocks.appInsertSingle })

    mocks.nadraInsert.mockReturnValue({ select: mocks.nadraInsertSelect })
    mocks.nadraInsertSelect.mockReturnValue({ single: mocks.nadraInsertSingle })
  })

  it('returns 409 when tracking number is duplicate', async () => {
    mocks.applicantMaybeSingle.mockResolvedValue({ data: { id: 'a-1', email: 'x@y.com' }, error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'app-1' }, error: null })
    mocks.nadraInsertSingle.mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'duplicate key value' },
    })

    const res = await POST(makeRequest(baseBody))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toEqual({
      error: 'Duplicate in system not allowed',
      details: 'This tracking number is already registered.',
    })
  })

  it('returns semantic payload on success', async () => {
    mocks.applicantMaybeSingle.mockResolvedValue({ data: { id: 'a-1', email: 'x@y.com' }, error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'app-1' }, error: null })
    mocks.nadraInsertSingle.mockResolvedValue({ data: { id: 'n-1', status: 'Pending Submission' }, error: null })
    mocks.nicopInsert.mockResolvedValue({ error: null })
    mocks.historyInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(baseBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      createdNadraServiceId: 'n-1',
      applicationId: 'app-1',
      applicantId: 'a-1',
      trackingNumber: 'TRK-123',
      status: 'Pending Submission',
    })
    expect(mocks.historyInsert).toHaveBeenCalledWith({
      nadra_service_id: 'n-1',
      new_status: 'Pending Submission',
      changed_by: 'emp-1',
      entry_type: 'status',
    })
  })

  it('returns 500 when history insert fails', async () => {
    mocks.applicantMaybeSingle.mockResolvedValue({ data: { id: 'a-1', email: 'x@y.com' }, error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'app-1' }, error: null })
    mocks.nadraInsertSingle.mockResolvedValue({ data: { id: 'n-1', status: 'Pending Submission' }, error: null })
    mocks.historyInsert.mockResolvedValue({ error: { message: 'history failed' } })

    const res = await POST(makeRequest(baseBody))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')
    expect(body.details).toBe('history failed')
  })
})
