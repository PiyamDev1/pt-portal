import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const applicationMaybeSingle = vi.fn()
  const applicationSelectEq = vi.fn(() => ({ maybeSingle: applicationMaybeSingle }))
  const applicationSelect = vi.fn(() => ({ eq: applicationSelectEq }))

  const applicationUpdateEq = vi.fn()
  const applicationUpdate = vi.fn(() => ({ eq: applicationUpdateEq }))
  const historyInsert = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'british_passport_applications') {
      return { select: applicationSelect, update: applicationUpdate }
    }
    if (table === 'british_passport_status_history') return { insert: historyInsert }
    return {}
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from }))
  const requireStaffSession = vi.fn()
  const tryGenerateReceiptForStatusTrigger = vi.fn()

  return {
    applicationMaybeSingle,
    applicationSelect,
    applicationSelectEq,
    applicationUpdateEq,
    applicationUpdate,
    historyInsert,
    from,
    getServiceSupabaseClient,
    requireStaffSession,
    tryGenerateReceiptForStatusTrigger,
  }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))
vi.mock('@/lib/services/receiptGenerator', () => ({
  tryGenerateReceiptForStatusTrigger: mocks.tryGenerateReceiptForStatusTrigger,
}))

import { POST } from '@/app/api/passports/gb/update-status/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/gb/update-status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/passports/gb/update-status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'staff-1', email: 'staff@example.com' },
      employee: {
        id: 'staff-1',
        email: 'staff@example.com',
        fullName: 'Staff',
        role: 'Agent',
        departments: [],
      },
    })
    mocks.getServiceSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      if (table === 'british_passport_applications') {
        return { select: mocks.applicationSelect, update: mocks.applicationUpdate }
      }
      if (table === 'british_passport_status_history') return { insert: mocks.historyInsert }
      return {}
    })
    mocks.applicationSelect.mockReturnValue({ eq: mocks.applicationSelectEq })
    mocks.applicationSelectEq.mockReturnValue({ maybeSingle: mocks.applicationMaybeSingle })
    mocks.applicationUpdate.mockReturnValue({ eq: mocks.applicationUpdateEq })
    mocks.historyInsert.mockResolvedValue({ error: null })
    mocks.tryGenerateReceiptForStatusTrigger.mockResolvedValue(undefined)
  })

  it('records a status transition using the authenticated staff identity', async () => {
    mocks.applicationMaybeSingle.mockResolvedValue({
      data: { status: 'Pending Submission' },
      error: null,
    })
    mocks.applicationUpdateEq.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        id: 'gb-1',
        status: 'Submitted',
        notes: 'Documents sent',
        userId: 'untrusted',
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updatedPassportId: 'gb-1', status: 'Submitted' })
    expect(mocks.applicationUpdate).toHaveBeenCalledWith({ status: 'Submitted' })
    expect(mocks.historyInsert).toHaveBeenCalledWith({
      passport_id: 'gb-1',
      old_status: 'Pending Submission',
      new_status: 'Submitted',
      notes: 'Documents sent',
      changed_by: 'staff-1',
    })
    expect(mocks.tryGenerateReceiptForStatusTrigger).toHaveBeenCalledWith({
      serviceType: 'gb_passport',
      serviceRecordId: 'gb-1',
      status: 'Submitted',
      generatedBy: 'staff-1',
    })
  })

  it('does not repeat history or receipt work for an unchanged status', async () => {
    mocks.applicationMaybeSingle.mockResolvedValue({ data: { status: 'Submitted' }, error: null })

    const res = await POST(makeRequest({ id: 'gb-1', status: 'Submitted' }))
    expect(res.status).toBe(200)
    expect(mocks.applicationUpdate).not.toHaveBeenCalled()
    expect(mocks.historyInsert).not.toHaveBeenCalled()
    expect(mocks.tryGenerateReceiptForStatusTrigger).not.toHaveBeenCalled()
  })

  it('returns 404 when the application does not exist', async () => {
    mocks.applicationMaybeSingle.mockResolvedValue({ data: null, error: null })

    expect((await POST(makeRequest({ id: 'missing', status: 'Submitted' }))).status).toBe(404)
  })

  it('returns 400 for invalid JSON or a missing status', async () => {
    const invalidJson = new Request('http://localhost/api/passports/gb/update-status', {
      method: 'POST',
      body: '{invalid json',
    })
    const missingStatus = makeRequest({ id: 'gb-1' })

    expect((await POST(invalidJson)).status).toBe(400)
    expect((await POST(missingStatus)).status).toBe(400)
  })
})
