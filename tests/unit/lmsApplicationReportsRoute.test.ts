import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const tableData: Record<string, { data: unknown[] | null; error: { message: string } | null }> =
    {}
  const queryCalls: Array<{ table: string; op: string; args: unknown[] }> = []

  const from = vi.fn((table: string) => ({
    select: vi.fn(() => {
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
        range: vi.fn((_from: number, _to: number) => {
          queryCalls.push({ table, op: 'range', args: [_from, _to] })
          return Promise.resolve(tableData[table] || { data: [], error: null })
        }),
      }
      return query
    }),
  }))

  const createClient = vi.fn(() => ({ from }))

  return {
    createClient,
    from,
    queryCalls,
    tableData,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { GET } from '@/app/api/lms/application-reports/route'

describe('GET /api/lms/application-reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.queryCalls.length = 0
    for (const key of Object.keys(mocks.tableData)) delete mocks.tableData[key]
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  })

  it('returns application totals and category counts by source', async () => {
    mocks.tableData.nadra_services = {
      data: [
        {
          id: 'n-1',
          status: 'Pending Submission',
          created_at: '2026-07-10T08:00:00.000Z',
          service_type: 'NICOP',
        },
        {
          id: 'n-2',
          status: 'Completed',
          created_at: '2026-07-11T08:00:00.000Z',
          service_type: 'NICOP',
        },
      ],
      error: null,
    }
    mocks.tableData.pakistani_passport_applications = {
      data: [
        {
          id: 'p-1',
          status: 'Passport Arrived',
          created_at: '2026-07-12T08:00:00.000Z',
          category: 'Adult 10 Year',
          application_type: 'Renewal',
          page_count: '36',
          speed: 'Urgent',
        },
      ],
      error: null,
    }
    mocks.tableData.british_passport_applications = {
      data: [
        {
          id: 'g-1',
          status: 'Pending Submission',
          created_at: '2026-07-13T08:00:00.000Z',
          age_group: 'Adult',
          pages: '48',
          service_type: 'Fast Track',
        },
      ],
      error: null,
    }
    mocks.tableData.visa_applications = {
      data: [
        {
          id: 'v-1',
          status: 'Approved',
          created_at: '2026-07-14T08:00:00.000Z',
          is_part_of_package: true,
          visa_countries: { name: 'Saudi Arabia' },
          visa_types: { name: 'Umrah' },
        },
      ],
      error: null,
    }

    const response = await GET(
      new Request('http://localhost/api/lms/application-reports?from=2026-07-01&to=2026-07-31'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.totals).toEqual({
      applications: 5,
      active: 3,
      completed: 2,
      attention: 3,
      categories: 4,
    })
    expect(payload.byCategory[0]).toMatchObject({
      serviceKey: 'nadra',
      category: 'NICOP',
      count: 2,
    })
    expect(payload.byCategory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceKey: 'pak_passport',
          category: 'Adult 10 Year / Renewal / 36 / Urgent',
          count: 1,
        }),
        expect.objectContaining({
          serviceKey: 'gb_passport',
          category: 'Adult / 48 pages / Fast Track',
          count: 1,
        }),
        expect.objectContaining({
          serviceKey: 'visa',
          category: 'Saudi Arabia / Umrah / Package',
          count: 1,
        }),
      ]),
    )
    expect(payload.recentApplications[0].id).toBe('v-1')
    expect(payload.service).toBe('all')
    expect(payload.trend).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          date: '2026-07-10',
          total: 1,
          byService: expect.objectContaining({ nadra: 1 }),
        }),
        expect.objectContaining({
          date: '2026-07-14',
          total: 1,
          byService: expect.objectContaining({ visa: 1 }),
        }),
      ]),
    )
    expect(mocks.queryCalls).toContainEqual(
      expect.objectContaining({
        table: 'nadra_services',
        op: 'gte',
        args: expect.arrayContaining(['created_at']),
      }),
    )
  })

  it('returns warnings when a source query fails', async () => {
    mocks.tableData.nadra_services = {
      data: [{ id: 'n-1', status: 'Completed', created_at: '2026-07-10', service_type: 'FRC' }],
      error: null,
    }
    mocks.tableData.pakistani_passport_applications = { data: null, error: { message: 'missing' } }
    mocks.tableData.british_passport_applications = { data: [], error: null }
    mocks.tableData.visa_applications = { data: [], error: null }

    const response = await GET(new Request('http://localhost/api/lms/application-reports'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.totals.applications).toBe(1)
    expect(payload.warnings[0].label).toBe('pak_passport')
    expect(payload.warnings[0].message).toContain('missing')
  })

  it('filters report queries to a selected application source', async () => {
    mocks.tableData.visa_applications = {
      data: [
        {
          id: 'v-1',
          status: 'Pending',
          created_at: '2026-07-15T08:00:00.000Z',
          application_date: '2026-07-16T08:00:00.000Z',
          visa_countries: { name: 'Turkey' },
          visa_types: { name: 'Tourist' },
        },
      ],
      error: null,
    }

    const response = await GET(
      new Request('http://localhost/api/lms/application-reports?service=visa'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.service).toBe('visa')
    expect(payload.totals.applications).toBe(1)
    expect(payload.byCategory[0]).toMatchObject({
      serviceKey: 'visa',
      category: 'Turkey / Tourist',
      count: 1,
    })
    expect(payload.recentApplications[0].appliedAt).toBe('2026-07-16T08:00:00.000Z')
    expect(mocks.from).toHaveBeenCalledTimes(1)
    expect(mocks.from).toHaveBeenCalledWith('visa_applications')
  })

  it('rejects an inverted date range', async () => {
    const response = await GET(
      new Request('http://localhost/api/lms/application-reports?from=2026-08-01&to=2026-07-01'),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toBe('from must be on or before to')
  })

  it('rejects an unknown service filter', async () => {
    const response = await GET(
      new Request('http://localhost/api/lms/application-reports?service=unknown'),
    )
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('service must be')
  })
})
