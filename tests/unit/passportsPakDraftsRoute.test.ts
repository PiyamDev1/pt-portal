import { beforeEach, describe, expect, it, vi } from 'vitest'

type QueryResult = {
  data?: unknown
  error?: unknown
}

const mocks = vi.hoisted(() => {
  const queues = new Map<string, any[]>()
  const from = vi.fn((table: string) => {
    const queue = queues.get(table) || []
    const query = queue.shift()
    queues.set(table, queue)
    return query || makeQuery()
  })
  const getSupabaseClient = vi.fn(() => ({ from }))
  const sendPakPassportDraftAssignmentEmail = vi.fn()

  function makeQuery(result: QueryResult = { data: null, error: null }) {
    const query: any = {
      select: vi.fn(() => query),
      insert: vi.fn(() => query),
      update: vi.fn(() => query),
      delete: vi.fn(() => query),
      eq: vi.fn(() => query),
      in: vi.fn(() => query),
      is: vi.fn(() => query),
      lte: vi.fn(() => query),
      neq: vi.fn(() => query),
      not: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      single: vi.fn(() => Promise.resolve(result)),
      maybeSingle: vi.fn(() => Promise.resolve(result)),
      then: (resolve: (value: QueryResult) => unknown, reject: (reason?: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
    }
    return query
  }

  return {
    queues,
    from,
    getSupabaseClient,
    makeQuery,
    sendPakPassportDraftAssignmentEmail,
  }
})

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

vi.mock('@/lib/passports/pakDraftAssignmentEmail', () => ({
  sendPakPassportDraftAssignmentEmail: mocks.sendPakPassportDraftAssignmentEmail,
}))

import { POST } from '@/app/api/passports/pak/drafts/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/passports/pak/drafts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const baseDraftPayload = {
  applicantName: 'John Doe',
  applicantCnic: '12345-1234567-1',
  applicantEmail: 'john@example.com',
  applicantPhone: '0711111111',
  familyHeadEmail: 'fh@example.com',
  applicationType: 'Renewal',
  category: 'Adult 10 Year',
  pageCount: '34 pages',
  speed: 'Normal',
  oldPassportNumber: 'ab123',
  paymentStatus: 'taken',
  paymentAmount: '120',
  currentUserId: 'emp-1',
}

function queue(table: string, ...queries: any[]) {
  mocks.queues.set(table, queries)
}

describe('POST /api/passports/pak/drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queues.clear()
    mocks.sendPakPassportDraftAssignmentEmail.mockResolvedValue({
      sent: true,
      recipientEmail: 'worker@example.com',
      senderEmail: 'noreply.applications@piyamtravel.com',
    })
  })

  it('creates a draft without writing an application tracking number', async () => {
    const insertQuery = mocks.makeQuery({
      data: {
        id: 'draft-row-1',
        draft_id: 'PKD-ABCDE12345',
        applicant_name: 'John Doe',
        status: 'Documents Pending',
      },
      error: null,
    })
    queue('pakistani_passport_drafts', insertQuery)

    const res = await POST(makeRequest({ action: 'create', ...baseDraftPayload }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.draft.draft_id).toMatch(/^PKD-[A-Z0-9]{10}$/)
    const insertPayload = insertQuery.insert.mock.calls[0][0]
    expect(insertPayload).toMatchObject({
      applicant_name: 'John Doe',
      applicant_cnic: '12345-1234567-1',
      old_passport_number: 'AB123',
    })
    expect(insertPayload).not.toHaveProperty('tracking_number')
    expect(mocks.from).not.toHaveBeenCalledWith('applications')
  })

  it('does not store old passport number for first-time drafts', async () => {
    const insertQuery = mocks.makeQuery({
      data: {
        id: 'draft-row-1',
        draft_id: 'PKD-ABCDE12345',
        applicant_name: 'John Doe',
        status: 'Documents Pending',
      },
      error: null,
    })
    queue('pakistani_passport_drafts', insertQuery)

    const res = await POST(
      makeRequest({
        action: 'create',
        ...baseDraftPayload,
        applicationType: 'First Time',
        oldPassportNumber: 'P123',
      }),
    )

    expect(res.status).toBe(200)
    expect(insertQuery.insert.mock.calls[0][0]).toMatchObject({
      application_type: 'First Time',
      old_passport_number: null,
    })
  })

  it('allows draft creation before family head email is known', async () => {
    const insertQuery = mocks.makeQuery({
      data: {
        id: 'draft-row-1',
        draft_id: 'PKD-ABCDE12345',
        applicant_name: 'John Doe',
        status: 'Documents Pending',
      },
      error: null,
    })
    queue('pakistani_passport_drafts', insertQuery)

    const res = await POST(
      makeRequest({
        action: 'create',
        ...baseDraftPayload,
        familyHeadEmail: '',
      }),
    )

    expect(res.status).toBe(200)
    expect(insertQuery.insert.mock.calls[0][0]).toMatchObject({
      family_head_email: '',
    })
  })

  it('emails the assigned applications worker when a draft is created', async () => {
    const insertQuery = mocks.makeQuery({
      data: {
        id: 'draft-row-1',
        draft_id: 'PKD-ABCDE12345',
        applicant_name: 'John Doe',
        applicant_cnic: '12345-1234567-1',
        application_type: 'Renewal',
        category: 'Adult 10 Year',
        page_count: '34 pages',
        speed: 'Normal',
        assigned_employee_id: 'worker-1',
        status: 'Documents Pending',
      },
      error: null,
    })
    queue('pakistani_passport_drafts', insertQuery)
    queue(
      'employees',
      mocks.makeQuery({
        data: { id: 'worker-1', full_name: 'Worker One', email: 'worker@example.com' },
        error: null,
      }),
      mocks.makeQuery({ data: { id: 'emp-1', full_name: 'Creator One' }, error: null }),
    )

    const res = await POST(
      makeRequest({
        action: 'create',
        ...baseDraftPayload,
        assignedEmployeeId: 'worker-1',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.assignmentNotification).toMatchObject({
      sent: true,
      recipientEmail: 'worker@example.com',
    })
    expect(mocks.sendPakPassportDraftAssignmentEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'worker@example.com',
        assigneeName: 'Worker One',
        draftId: 'PKD-ABCDE12345',
        applicantName: 'John Doe',
        assignedByName: 'Creator One',
      }),
    )
  })

  it('returns a validation response when the draft insert violates a database constraint', async () => {
    queue(
      'pakistani_passport_drafts',
      mocks.makeQuery({
        data: null,
        error: {
          code: '23503',
          message: 'insert or update on table "pakistani_passport_drafts" violates foreign key constraint',
        },
      }),
    )

    const res = await POST(makeRequest({ action: 'create', ...baseDraftPayload }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toContain('foreign key constraint')
  })

  it('rejects conversion when the official tracking number already exists', async () => {
    queue(
      'pakistani_passport_drafts',
      mocks.makeQuery({
        data: {
          id: 'draft-row-1',
          draft_id: 'PKD-ABCDE12345',
          applicant_name: 'John Doe',
          applicant_cnic: '12345-1234567-1',
          family_head_email: 'fh@example.com',
          application_type: 'Renewal',
          category: 'Adult 10 Year',
          speed: 'Normal',
          status: 'Documents Pending',
        },
        error: null,
      }),
    )
    queue('applications', mocks.makeQuery({ data: { id: 'app-existing' }, error: null }))

    const res = await POST(
      makeRequest({
        action: 'convert',
        draftId: 'draft-row-1',
        trackingNumber: 'pk-111',
        currentUserId: 'emp-1',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.errorCode).toBe('DUPLICATE_TRACKING')
    expect(body.trackingNumber).toBe('PK-111')
  })

  it('converts a draft and moves draft documents to the real application id', async () => {
    const draftLookup = mocks.makeQuery({
      data: {
        id: 'draft-row-1',
        draft_id: 'PKD-ABCDE12345',
        applicant_name: 'Jane Doe',
        applicant_cnic: '12345-1234567-1',
        applicant_email: 'jane@example.com',
        applicant_phone: '0711111111',
        family_head_email: 'fh@example.com',
        application_type: 'Renewal',
        category: 'Adult 10 Year',
        page_count: '34 pages',
        speed: 'Normal',
        old_passport_number: 'P123',
        status: 'Ready to Process',
        created_by: 'emp-1',
      },
      error: null,
    })
    const convertedDraft = mocks.makeQuery({
      data: {
        id: 'draft-row-1',
        draft_id: 'PKD-ABCDE12345',
        status: 'Converted',
      },
      error: null,
    })
    queue('pakistani_passport_drafts', draftLookup, convertedDraft)

    const appDuplicateLookup = mocks.makeQuery({ data: null, error: null })
    const appInsert = mocks.makeQuery({ data: { id: 'app-1' }, error: null })
    queue('applications', appDuplicateLookup, appInsert)

    queue(
      'applicants',
      mocks.makeQuery({
        data: { id: 'applicant-1', email: null, phone_number: null },
        error: null,
      }),
      mocks.makeQuery({ data: null, error: null }),
    )

    const passportInsert = mocks.makeQuery({ data: { id: 'passport-1' }, error: null })
    queue('pakistani_passport_applications', passportInsert)

    const documentsUpdate = mocks.makeQuery({ data: null, error: null })
    queue('documents', documentsUpdate)

    const res = await POST(
      makeRequest({
        action: 'convert',
        draftId: 'draft-row-1',
        trackingNumber: 'pk-222',
        currentUserId: 'emp-1',
      }),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      convertedDraftId: 'draft-row-1',
      draftId: 'PKD-ABCDE12345',
      applicationId: 'app-1',
      passportApplicationId: 'passport-1',
      trackingNumber: 'PK-222',
    })
    expect(appInsert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tracking_number: 'PK-222',
        applicant_id: 'applicant-1',
      }),
    )
    expect(documentsUpdate.update).toHaveBeenCalledWith({ family_head_id: 'app-1' })
    expect(documentsUpdate.eq).toHaveBeenCalledWith('family_head_id', 'PKD-ABCDE12345')
    expect(convertedDraft.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'Converted',
        converted_application_id: 'app-1',
        official_tracking_number: 'PK-222',
      }),
    )
  })
})
