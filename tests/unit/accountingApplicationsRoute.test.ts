import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tableData: Record<string, { data: unknown[] | null; error: { message: string } | null }> =
    {}
  const queryCalls: Array<{ table: string; op: string; args: unknown[] }> = []
  const getUser = vi.fn()

  const from = vi.fn((table: string) => ({
    select: vi.fn((columns: string) => {
      queryCalls.push({ table, op: 'select', args: [columns] })
      const query = {
        gte: vi.fn((column: string, value: string) => {
          queryCalls.push({ table, op: 'gte', args: [column, value] })
          return query
        }),
        lt: vi.fn((column: string, value: string) => {
          queryCalls.push({ table, op: 'lt', args: [column, value] })
          return query
        }),
        order: vi.fn((column: string, options: { ascending: boolean }) => {
          queryCalls.push({ table, op: 'order', args: [column, options] })
          return query
        }),
        range: vi.fn((start: number, end: number) => {
          queryCalls.push({ table, op: 'range', args: [start, end] })
          return Promise.resolve(tableData[table] || { data: [], error: null })
        }),
      }
      return query
    }),
  }))

  const createServerClient = vi.fn(() => ({
    auth: { getUser },
    from,
  }))
  const cookies = vi.fn(async () => ({ getAll: vi.fn(() => []) }))

  return { cookies, createServerClient, from, getUser, queryCalls, tableData }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: mocks.createServerClient,
}))
vi.mock('next/headers', () => ({ cookies: mocks.cookies }))

import { GET } from '@/app/api/accounting/applications/route'

function section(payload: any, source: string) {
  return payload.sections.find((item: { source: string }) => item.source === source)
}

describe('GET /api/accounting/applications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryCalls.length = 0
    for (const key of Object.keys(mocks.tableData)) delete mocks.tableData[key]
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
  })

  it('groups application categories into the correct calendar months', async () => {
    mocks.tableData.nadra_services = {
      data: [
        {
          id: 'n-1',
          created_at: '2026-01-04T09:00:00.000Z',
          status: 'Pending Submission',
          tracking_number: 'NADRA-001',
          service_type: 'NICOP',
          applicants: { first_name: 'Ali', last_name: 'Khan' },
          nicop_cnic_details: { service_option: 'Normal' },
        },
        {
          id: 'n-2',
          created_at: '2026-01-18T09:00:00.000Z',
          service_type: 'NICOP',
          nicop_cnic_details: [{ service_option: 'Normal' }],
        },
        {
          id: 'n-3',
          created_at: '2026-02-01T09:00:00.000Z',
          service_type: 'NICOP',
          nicop_cnic_details: { service_option: 'Executive' },
        },
      ],
      error: null,
    }
    mocks.tableData.pakistani_passport_applications = {
      data: [
        {
          id: 'p-1',
          created_at: '2026-01-10T09:00:00.000Z',
          status: 'Processing',
          category: 'Adult 10 Year',
          speed: 'Urgent',
          applicants: { first_name: 'Sara', last_name: 'Ahmed' },
          applications: { tracking_number: 'PK-001' },
        },
        {
          id: 'p-2',
          created_at: '2026-02-10T09:00:00.000Z',
          category: 'Adult 5 Year',
          speed: 'Normal',
        },
      ],
      error: null,
    }
    mocks.tableData.british_passport_applications = {
      data: [
        {
          id: 'g-1',
          created_at: '2026-01-12T09:00:00.000Z',
          status: 'In Progress',
          age_group: 'Adult',
          service_type: 'Express',
          applicants: { first_name: 'Adam', last_name: 'Smith' },
          applications: { tracking_number: 'GB-001' },
        },
        {
          id: 'g-2',
          created_at: '2026-01-20T09:00:00.000Z',
          age_group: 'Child',
          service_type: 'Express',
        },
      ],
      error: null,
    }
    mocks.tableData.visa_applications = {
      data: [
        {
          id: 'v-1',
          created_at: '2026-01-14T09:00:00.000Z',
          status: 'Pending',
          internal_tracking_number: 'VISA-001',
          applicants: { first_name: 'Maryam', last_name: 'Iqbal' },
          visa_countries: { name: 'Saudi Arabia' },
          visa_types: { name: 'Umrah' },
        },
      ],
      error: null,
    }

    const response = await GET(
      new Request('http://localhost/api/accounting/applications?year=2026'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.totals.applications).toBe(8)
    expect(payload.totals.recordedApplications).toBe(8)
    expect(payload.totals.cancelledOrRefunded).toBe(0)
    expect(payload.months[0]).toMatchObject({ label: 'January', total: 6 })
    expect(payload.months[1]).toMatchObject({ label: 'February', total: 2 })

    expect(section(payload, 'nadra').rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          application: 'NICOP',
          category: 'Normal',
          total: 2,
          recorded: 2,
          cancelledOrRefunded: 0,
          monthlyCounts: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
        expect.objectContaining({
          application: 'NICOP',
          category: 'Executive',
          total: 1,
          monthlyCounts: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      ]),
    )
    expect(section(payload, 'pak_passport').rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          application: 'PK Passport - Adult 10 Year',
          category: 'Urgent',
          monthlyCounts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
        expect.objectContaining({
          application: 'PK Passport - Adult 5 Year',
          category: 'Normal',
          monthlyCounts: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      ]),
    )
    expect(section(payload, 'gb_passport').rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          application: 'GB Passport - Adult',
          category: 'Express',
        }),
        expect.objectContaining({
          application: 'GB Passport - Child',
          category: 'Express',
        }),
      ]),
    )
    expect(section(payload, 'visa').rows[0]).toMatchObject({
      application: 'Saudi Arabia Visa',
      category: 'Umrah',
    })
    expect(section(payload, 'pak_passport').rows[0].applications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantName: 'Sara Ahmed',
          trackingNumber: 'PK-001',
          status: 'Processing',
          deductionReason: null,
        }),
      ]),
    )
    expect(mocks.queryCalls).toContainEqual({
      table: 'nadra_services',
      op: 'select',
      args: [
        'id, created_at, status, is_refunded, tracking_number, service_type, applicants(first_name, last_name), nicop_cnic_details(service_option)',
      ],
    })
    expect(mocks.queryCalls).toContainEqual({
      table: 'pakistani_passport_applications',
      op: 'select',
      args: [
        'id, created_at, status, is_refunded, category, speed, applicants(first_name, last_name), applications(tracking_number)',
      ],
    })
    expect(mocks.queryCalls).toContainEqual({
      table: 'british_passport_applications',
      op: 'select',
      args: [
        'id, created_at, status, age_group, service_type, applicants(first_name, last_name), applications(tracking_number)',
      ],
    })
  })

  it('subtracts cancelled and refunded records while retaining their applicant details', async () => {
    mocks.tableData.pakistani_passport_applications = {
      data: [
        {
          id: 'p-active',
          created_at: '2026-01-05T09:00:00.000Z',
          status: 'Processing',
          is_refunded: false,
          category: 'Adult 10 Year',
          speed: 'Urgent',
          applicants: { first_name: 'Active', last_name: 'Applicant' },
          applications: { tracking_number: 'PK-ACTIVE' },
        },
        {
          id: 'p-cancelled',
          created_at: '2026-01-06T09:00:00.000Z',
          status: 'Cancelled',
          is_refunded: false,
          category: 'Adult 10 Year',
          speed: 'Urgent',
          applicants: { first_name: 'Cancelled', last_name: 'Applicant' },
          applications: { tracking_number: 'PK-CANCELLED' },
        },
        {
          id: 'p-refunded',
          created_at: '2026-01-07T09:00:00.000Z',
          status: 'Processing',
          is_refunded: true,
          category: 'Adult 10 Year',
          speed: 'Urgent',
          applicants: { first_name: 'Refunded', last_name: 'Applicant' },
          applications: { tracking_number: 'PK-REFUNDED' },
        },
      ],
      error: null,
    }

    const response = await GET(
      new Request('http://localhost/api/accounting/applications?year=2026&service=pak_passport'),
    )
    const payload = await response.json()
    const row = section(payload, 'pak_passport').rows[0]

    expect(response.status).toBe(200)
    expect(payload.totals).toMatchObject({
      applications: 1,
      recordedApplications: 3,
      cancelledOrRefunded: 2,
    })
    expect(payload.months[0]).toMatchObject({
      total: 1,
      recorded: 3,
      cancelledOrRefunded: 2,
    })
    expect(row).toMatchObject({
      total: 1,
      recorded: 3,
      cancelledOrRefunded: 2,
      monthlyCounts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      monthlyCancelledOrRefunded: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    })
    expect(row.applications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantName: 'Active Applicant',
          trackingNumber: 'PK-ACTIVE',
          deductionReason: null,
        }),
        expect.objectContaining({
          applicantName: 'Cancelled Applicant',
          trackingNumber: 'PK-CANCELLED',
          deductionReason: 'Cancelled',
        }),
        expect.objectContaining({
          applicantName: 'Refunded Applicant',
          trackingNumber: 'PK-REFUNDED',
          deductionReason: 'Refunded',
        }),
      ]),
    )
  })

  it('queries only the selected application section', async () => {
    mocks.tableData.pakistani_passport_applications = {
      data: [
        {
          id: 'p-1',
          created_at: '2026-01-10T09:00:00.000Z',
          category: 'Child 5 Year',
          speed: 'Urgent',
        },
      ],
      error: null,
    }

    const response = await GET(
      new Request('http://localhost/api/accounting/applications?year=2026&service=pak_passport'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.service).toBe('pak_passport')
    expect(payload.sections).toHaveLength(1)
    expect(payload.sections[0].source).toBe('pak_passport')
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.from).toHaveBeenCalledWith('pakistani_passport_applications')
  })

  it('returns available totals with a warning when one source fails', async () => {
    mocks.tableData.nadra_services = {
      data: [
        {
          id: 'n-1',
          created_at: '2026-01-04T09:00:00.000Z',
          service_type: 'FRC',
          nicop_cnic_details: { service_option: 'Normal' },
        },
      ],
      error: null,
    }
    mocks.tableData.pakistani_passport_applications = {
      data: null,
      error: { message: 'table unavailable' },
    }

    const response = await GET(
      new Request('http://localhost/api/accounting/applications?year=2026'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.totals.applications).toBe(1)
    expect(payload.warnings).toEqual([
      expect.objectContaining({
        label: 'Pakistani Passport',
        message: expect.stringContaining('table unavailable'),
      }),
    ])
  })

  it('rejects an unsupported year or source filter', async () => {
    const invalidYear = await GET(
      new Request('http://localhost/api/accounting/applications?year=1999'),
    )
    const invalidService = await GET(
      new Request('http://localhost/api/accounting/applications?service=unknown'),
    )

    expect(invalidYear.status).toBe(400)
    expect((await invalidYear.json()).error).toContain('year must be between')
    expect(invalidService.status).toBe(400)
    expect((await invalidService.json()).error).toContain('service must be')
  })

  it('requires a logged-in portal user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })

    const response = await GET(new Request('http://localhost/api/accounting/applications'))

    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe('Unauthorized')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
