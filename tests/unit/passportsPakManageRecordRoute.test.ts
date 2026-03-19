import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const recordSingle = vi.fn()
  const recordEq = vi.fn(() => ({ single: recordSingle }))
  const recordSelect = vi.fn(() => ({ eq: recordEq }))

  const appDeleteEq = vi.fn()
  const appDelete = vi.fn(() => ({ eq: appDeleteEq }))

  const appUpdateEq = vi.fn()
  const appUpdate = vi.fn(() => ({ eq: appUpdateEq }))

  const applicantUpdateEq = vi.fn()
  const applicantUpdate = vi.fn(() => ({ eq: applicantUpdateEq }))

  const passportUpdateEq = vi.fn()
  const passportUpdate = vi.fn(() => ({ eq: passportUpdateEq }))

  const from = vi.fn((table: string) => {
    if (table === 'pakistani_passport_applications') {
      return {
        select: recordSelect,
        update: passportUpdate,
      }
    }
    if (table === 'applications') {
      return {
        delete: appDelete,
        update: appUpdate,
      }
    }
    if (table === 'applicants') {
      return { update: applicantUpdate }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    recordSingle,
    recordEq,
    recordSelect,
    appDeleteEq,
    appDelete,
    appUpdateEq,
    appUpdate,
    applicantUpdateEq,
    applicantUpdate,
    passportUpdateEq,
    passportUpdate,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/passports/pak/manage-record/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/pak/manage-record', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/passports/pak/manage-record', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.recordSelect.mockReturnValue({ eq: mocks.recordEq })
    mocks.recordEq.mockReturnValue({ single: mocks.recordSingle })
    mocks.appDelete.mockReturnValue({ eq: mocks.appDeleteEq })
    mocks.appUpdate.mockReturnValue({ eq: mocks.appUpdateEq })
    mocks.applicantUpdate.mockReturnValue({ eq: mocks.applicantUpdateEq })
    mocks.passportUpdate.mockReturnValue({ eq: mocks.passportUpdateEq })
  })

  it('returns 403 when delete auth code is missing', async () => {
    const res = await POST(makeRequest({ action: 'delete', id: 'p-1', userId: 'u-1' }))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/auth code required/i)
  })

  it('returns semantic payload on delete success', async () => {
    mocks.recordSingle.mockResolvedValue({ data: { id: 'p-1' }, error: null })
    mocks.appDeleteEq.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({ action: 'delete', id: 'p-1', authCode: '123456', userId: 'u-1' }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ deletedPassportApplicationId: 'p-1' })
  })

  it('returns semantic payload on update success', async () => {
    mocks.appUpdateEq.mockResolvedValue({ error: null })
    mocks.applicantUpdateEq.mockResolvedValue({ error: null })
    mocks.passportUpdateEq.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        action: 'update',
        id: 'p-1',
        data: {
          applicationId: 'app-1',
          passportId: 'p-1',
          trackingNumber: 'PK-999',
          applicantId: 'a-1',
          applicantName: 'Jane Doe',
          applicantCnic: '12345-1234567-1',
          applicantEmail: 'jane@example.com',
          applicantPhone: '0700000000',
          applicationType: 'Renewal',
        },
        userId: 'u-1',
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      updatedPassportApplicationId: 'p-1',
      updatedApplicationId: 'app-1',
    })
  })

  it('returns 400 for invalid action', async () => {
    const res = await POST(makeRequest({ action: 'noop', id: 'p-1', userId: 'u-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid action/i)
  })
})
