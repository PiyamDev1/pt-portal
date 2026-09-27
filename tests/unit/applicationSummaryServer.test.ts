import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('server-only', () => ({}))

import { loadApplicationSummary } from '@/lib/applications/summary.server'

const generatedAt = '2026-09-28T10:00:00.000Z'

describe('application summary server loader', () => {
  const tableData: Record<string, { data: unknown[] | null; error: { message: string } | null }> =
    {}
  const selectedColumns: Record<string, string> = {}

  const from = vi.fn((table: string) => ({
    select: vi.fn((columns: string) => {
      selectedColumns[table] = columns
      const query = {
        order: vi.fn(() => query),
        range: vi.fn(() => Promise.resolve(tableData[table] || { data: [], error: null })),
      }
      return query
    }),
  }))

  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(tableData)) delete tableData[key]
    for (const key of Object.keys(selectedColumns)) delete selectedColumns[key]
  })

  it('normalizes the four source schemas into one view model', async () => {
    tableData.nadra_services = {
      data: [
        {
          id: 'n-1',
          status: 'Pending Submission',
          created_at: '2026-09-20T09:00:00.000Z',
          tracking_number: 'NADRA-1',
          service_type: 'NICOP',
          applicants: { first_name: 'Ali', last_name: 'Khan' },
          applications: { tracking_number: 'APP-N-1', has_documents: false },
        },
      ],
      error: null,
    }
    tableData.pakistani_passport_applications = {
      data: [
        {
          id: 'p-1',
          status: 'Passport Arrived',
          created_at: '2026-09-26T09:00:00.000Z',
          tracking_number: 'PAK-1',
          application_type: 'Renewal',
          applicants: [{ first_name: 'Sara', last_name: 'Ahmed' }],
          applications: { tracking_number: 'APP-P-1', has_documents: false },
        },
      ],
      error: null,
    }
    tableData.british_passport_applications = {
      data: [
        {
          id: 'g-1',
          status: 'Completed',
          created_at: '2026-09-27T09:00:00.000Z',
          pex_number: 'pex123',
          service_type: 'Express',
          applicants: { first_name: 'Ben', last_name: 'Taylor' },
          applications: { tracking_number: 'APP-G-1', has_documents: true },
        },
      ],
      error: null,
    }
    tableData.visa_applications = {
      data: [
        {
          id: 'v-1',
          status: 'Pending',
          created_at: '2026-09-28T09:00:00.000Z',
          internal_tracking_number: 'VISA-1',
          applicants: { first_name: 'Maryam', last_name: 'Iqbal' },
          visa_countries: { name: 'Saudi Arabia' },
        },
      ],
      error: null,
    }

    const summary = await loadApplicationSummary({ from } as unknown as SupabaseClient, generatedAt)

    expect(summary.totals).toMatchObject({ total: 4, attention: 3, missingDocuments: 1 })
    expect(summary.recent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'n-1', trackingNumber: 'NADRA-1' }),
        expect.objectContaining({ id: 'p-1', serviceLabel: 'PAK Renewal' }),
        expect.objectContaining({ id: 'g-1', trackingNumber: 'PEX123' }),
        expect.objectContaining({ id: 'v-1', serviceLabel: 'Saudi Arabia' }),
      ]),
    )
    expect(selectedColumns.pakistani_passport_applications).toContain(
      'applications(tracking_number, has_documents)',
    )
    expect(selectedColumns.nadra_services).not.toContain('has_documents')
    expect(selectedColumns.visa_applications).not.toContain('has_documents')
  })

  it('retains successful source totals when one source query fails', async () => {
    tableData.nadra_services = { data: null, error: { message: 'not available' } }
    tableData.visa_applications = {
      data: [
        {
          id: 'v-1',
          status: 'Approved',
          created_at: '2026-09-27T09:00:00.000Z',
          internal_tracking_number: 'VISA-1',
        },
      ],
      error: null,
    }

    const summary = await loadApplicationSummary({ from } as unknown as SupabaseClient, generatedAt)

    expect(summary.totals.total).toBe(1)
    expect(summary.sources.nadra.available).toBe(false)
    expect(summary.warnings).toEqual([
      expect.objectContaining({
        source: 'nadra',
        message: 'NADRA applications could not be loaded.',
      }),
    ])
  })
})
