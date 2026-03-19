import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const applicantSingle = vi.fn()
  const applicantEq = vi.fn(() => ({ single: applicantSingle }))
  const applicantSelect = vi.fn(() => ({ eq: applicantEq }))

  const applicantUpdateEq = vi.fn()
  const applicantUpdate = vi.fn(() => ({ eq: applicantUpdateEq }))

  const applicantInsertSingle = vi.fn()
  const applicantInsertSelect = vi.fn(() => ({ single: applicantInsertSingle }))
  const applicantInsert = vi.fn(() => ({ select: applicantInsertSelect }))

  const appInsertSingle = vi.fn()
  const appInsertSelect = vi.fn(() => ({ single: appInsertSingle }))
  const appInsert = vi.fn(() => ({ select: appInsertSelect }))

  const appDeleteEq = vi.fn()
  const appDelete = vi.fn(() => ({ eq: appDeleteEq }))

  const pakInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'applicants') {
      return {
        select: applicantSelect,
        update: applicantUpdate,
        insert: applicantInsert,
      }
    }
    if (table === 'applications') return { insert: appInsert, delete: appDelete }
    if (table === 'pakistani_passport_applications') return { insert: pakInsert }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    applicantSingle,
    applicantEq,
    applicantSelect,
    applicantUpdateEq,
    applicantUpdate,
    applicantInsertSingle,
    applicantInsertSelect,
    applicantInsert,
    appInsertSingle,
    appInsertSelect,
    appInsert,
    appDeleteEq,
    appDelete,
    pakInsert,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/passports/pak/add-application/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/pak/add-application', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const baseBody = {
  applicantCnic: '12345-1234567-1',
  applicantName: 'John Doe',
  applicantEmail: 'john@example.com',
  applicantPhone: '0711111111',
  familyHeadEmail: 'fh@example.com',
  applicationType: 'Renewal',
  category: 'Adult 10 Year',
  pageCount: '34 pages',
  speed: 'Normal',
  oldPassportNumber: 'P123',
  trackingNumber: 'PK-111',
  fingerprintsCompleted: true,
  currentUserId: 'emp-1',
}

describe('POST /api/passports/pak/add-application', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.applicantSelect.mockReturnValue({ eq: mocks.applicantEq })
    mocks.applicantEq.mockReturnValue({ single: mocks.applicantSingle })
    mocks.applicantUpdate.mockReturnValue({ eq: mocks.applicantUpdateEq })
    mocks.applicantInsert.mockReturnValue({ select: mocks.applicantInsertSelect })
    mocks.applicantInsertSelect.mockReturnValue({ single: mocks.applicantInsertSingle })
    mocks.appInsert.mockReturnValue({ select: mocks.appInsertSelect })
    mocks.appInsertSelect.mockReturnValue({ single: mocks.appInsertSingle })
    mocks.appDelete.mockReturnValue({ eq: mocks.appDeleteEq })
  })

  it('returns semantic payload on success with existing applicant', async () => {
    mocks.applicantSingle.mockResolvedValue({ data: { id: 'a-1' }, error: null })
    mocks.applicantUpdateEq.mockResolvedValue({ error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'app-1' }, error: null })
    mocks.pakInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(baseBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      createdApplicationId: 'app-1',
      applicantId: 'a-1',
      trackingNumber: 'PK-111',
      status: 'Pending Submission',
    })
  })

  it('creates applicant when not found', async () => {
    mocks.applicantSingle.mockResolvedValue({ data: null, error: null })
    mocks.applicantInsertSingle.mockResolvedValue({ data: { id: 'a-new' }, error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'app-1' }, error: null })
    mocks.pakInsert.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(baseBody))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.applicantId).toBe('a-new')
  })

  it('rolls back app and returns 500 when passport insert fails', async () => {
    mocks.applicantSingle.mockResolvedValue({ data: { id: 'a-1' }, error: null })
    mocks.appInsertSingle.mockResolvedValue({ data: { id: 'app-1' }, error: null })
    mocks.pakInsert.mockResolvedValue({ error: { message: 'insert failed' } })
    mocks.appDeleteEq.mockResolvedValue({ error: null })

    const res = await POST(makeRequest(baseBody))

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('insert failed')
    expect(mocks.appDeleteEq).toHaveBeenCalledWith('id', 'app-1')
  })
})
