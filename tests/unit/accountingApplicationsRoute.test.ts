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
          service_type: 'NICOP',
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
          speed: 'Urgent',
        },
        {
          id: 'p-2',
          created_at: '2026-02-10T09:00:00.000Z',
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
    expect(payload.totals.applications).toBe(7)
    expect(payload.months[0]).toMatchObject({ label: 'January', total: 5 })
    expect(payload.months[1]).toMatchObject({ label: 'February', total: 2 })

    expect(section(payload, 'nadra').rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          application: 'NICOP',
          category: 'Normal',
          total: 2,
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
          application: 'PK Passport',
          category: 'Urgent',
          monthlyCounts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      ]),
    )
    expect(section(payload, 'gb_passport').rows[0]).toMatchObject({
      application: 'GB Passport',
      category: 'Express',
    })
    expect(section(payload, 'visa').rows[0]).toMatchObject({
      application: 'Saudi Arabia Visa',
      category: 'Umrah',
    })
    expect(mocks.queryCalls).toContainEqual({
      table: 'nadra_services',
      op: 'select',
      args: ['id, created_at, service_type, nicop_cnic_details(service_option)'],
    })
  })

  it('queries only the selected application section', async () => {
    mocks.tableData.pakistani_passport_applications = {
      data: [
        {
          id: 'p-1',
          created_at: '2026-01-10T09:00:00.000Z',
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
