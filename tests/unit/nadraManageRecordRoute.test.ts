import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const deletionFetchSingle = vi.fn()
  const deletionFetchEq = vi.fn(() => ({ single: deletionFetchSingle }))
  const deletionFetchSelect = vi.fn(() => ({ eq: deletionFetchEq }))

  const deletionLogInsert = vi.fn()

  const nadraDeleteEq = vi.fn()
  const nadraDelete = vi.fn(() => ({ eq: nadraDeleteEq }))

  const appDeleteEq = vi.fn()
  const appDelete = vi.fn(() => ({ eq: appDeleteEq }))

  const applicantDeleteEq = vi.fn()
  const applicantDelete = vi.fn(() => ({ eq: applicantDeleteEq }))

  const applicantUpdateEq = vi.fn()
  const applicantUpdate = vi.fn(() => ({ eq: applicantUpdateEq }))

  const nadraUpdateEq = vi.fn()
  const nadraUpdate = vi.fn(() => ({ eq: nadraUpdateEq }))

  const from = vi.fn((table: string) => {
    if (table === 'nadra_services') {
      return {
        select: deletionFetchSelect,
        delete: nadraDelete,
        update: nadraUpdate,
      }
    }
    if (table === 'deletion_logs') return { insert: deletionLogInsert }
    if (table === 'applications') return { delete: appDelete }
    if (table === 'applicants') return { delete: applicantDelete, update: applicantUpdate }
    if (table === 'nicop_cnic_details') return { upsert: vi.fn().mockResolvedValue({ error: null }) }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    deletionFetchSingle,
    deletionFetchEq,
    deletionFetchSelect,
    deletionLogInsert,
    nadraDeleteEq,
    nadraDelete,
    appDeleteEq,
    appDelete,
    applicantDeleteEq,
    applicantDelete,
    applicantUpdateEq,
    applicantUpdate,
    nadraUpdateEq,
    nadraUpdate,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/nadra/manage-record/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/nadra/manage-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/nadra/manage-record', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.deletionFetchSelect.mockReturnValue({ eq: mocks.deletionFetchEq })
    mocks.deletionFetchEq.mockReturnValue({ single: mocks.deletionFetchSingle })
    mocks.nadraDelete.mockReturnValue({ eq: mocks.nadraDeleteEq })
    mocks.appDelete.mockReturnValue({ eq: mocks.appDeleteEq })
    mocks.applicantDelete.mockReturnValue({ eq: mocks.applicantDeleteEq })
    mocks.applicantUpdate.mockReturnValue({ eq: mocks.applicantUpdateEq })
    mocks.nadraUpdate.mockReturnValue({ eq: mocks.nadraUpdateEq })
  })

  it('returns 400 when action or type is missing', async () => {
    const res = await POST(makeRequest({ id: 'n-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/missing action or type/i)
  })

  it('returns semantic payload for update action', async () => {
    mocks.applicantUpdateEq.mockResolvedValue({ error: null })
    mocks.nadraUpdateEq.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        action: 'update',
        type: 'application',
        id: 'n-1',
        data: {
          applicantId: 'a-1',
          firstName: 'Jane',
          lastName: 'Doe',
          cnic: '12345-1234567-1',
          serviceType: 'NICOP',
          trackingNumber: 'TRK-NEW',
        },
        userId: 'u-1',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      updatedRecordType: 'application',
      updatedRecordId: 'n-1',
    })
  })

  it('returns semantic payload for application delete action', async () => {
    mocks.deletionFetchSingle.mockResolvedValue({
      data: { id: 'n-1', application_id: 'app-1', applicant_id: 'a-1' },
      error: null,
    })
    mocks.deletionLogInsert.mockResolvedValue({ error: null })
    mocks.nadraDeleteEq.mockResolvedValue({ error: null })
    mocks.appDeleteEq.mockResolvedValue({ error: null })
    mocks.applicantDeleteEq.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        action: 'delete',
        type: 'application',
        id: 'n-1',
        authCode: '123456',
        userId: 'u-1',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      deletedRecordType: 'application',
      deletedRecordId: 'n-1',
    })
  })
}
)