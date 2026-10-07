import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const applicationMaybeSingle = vi.fn()
  const applicationSelectEq = vi.fn(() => ({ maybeSingle: applicationMaybeSingle }))
  const applicationSelect = vi.fn(() => ({ eq: applicationSelectEq }))

  const applicationUpdateEq = vi.fn()
  const applicationUpdate = vi.fn(() => ({ eq: applicationUpdateEq }))

  const applicantUpdateEq = vi.fn()
  const applicantUpdate = vi.fn(() => ({ eq: applicantUpdateEq }))

  const from = vi.fn((table: string) => {
    if (table === 'british_passport_applications') {
      return { select: applicationSelect, update: applicationUpdate }
    }
    if (table === 'applicants') return { update: applicantUpdate }
    return {}
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from }))
  const requireStaffSession = vi.fn()

  return {
    applicationMaybeSingle,
    applicationSelect,
    applicationSelectEq,
    applicationUpdateEq,
    applicationUpdate,
    applicantUpdateEq,
    applicantUpdate,
    from,
    getServiceSupabaseClient,
    requireStaffSession,
  }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

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
      if (table === 'applicants') return { update: mocks.applicantUpdate }
      return {}
    })
    mocks.applicationSelect.mockReturnValue({ eq: mocks.applicationSelectEq })
    mocks.applicationSelectEq.mockReturnValue({ maybeSingle: mocks.applicationMaybeSingle })
    mocks.applicationUpdate.mockReturnValue({ eq: mocks.applicationUpdateEq })
    mocks.applicantUpdate.mockReturnValue({ eq: mocks.applicantUpdateEq })
  })

  it('updates only applicant details and the PEX reference, preserving pricing and status', async () => {
    mocks.applicationMaybeSingle.mockResolvedValue({ data: { applicant_id: 'a-1' }, error: null })
    mocks.applicantUpdateEq.mockResolvedValue({ error: null })
    mocks.applicationUpdateEq.mockResolvedValue({ error: null })

    const res = await POST(
      makeRequest({
        id: 'gb-1',
        applicantName: 'Jane Doe',
        applicantPassport: 'P-222',
        dateOfBirth: '1992-01-01',
        phoneNumber: '999',
        pexNumber: 'abc123',
        status: 'Completed',
        pricingId: 'untrusted-pricing-id',
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ updatedPassportId: 'gb-1' })
    expect(mocks.applicantUpdate).toHaveBeenCalledWith({
      first_name: 'jane',
      last_name: 'doe',
      passport_number: 'P-222',
      date_of_birth: '1992-01-01',
      phone_number: '999',
    })
    expect(mocks.applicationUpdate).toHaveBeenCalledWith({ pex_number: 'ABC123' })
    expect(mocks.from).not.toHaveBeenCalledWith('gb_passport_pricing')
    expect(mocks.from).not.toHaveBeenCalledWith('british_passport_status_history')
  })

  it('returns 404 when the target application does not exist', async () => {
    mocks.applicationMaybeSingle.mockResolvedValue({ data: null, error: null })

    const res = await POST(makeRequest({ id: 'missing' }))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'Application not found' })
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new Request('http://localhost/api/passports/gb/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    })

    expect((await POST(req)).status).toBe(400)
  })
})
