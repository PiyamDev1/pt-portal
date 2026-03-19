import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const lte = vi.fn()
  const inFilter = vi.fn(() => ({ lte }))
  const select = vi.fn(() => ({ in: inFilter }))

  const from = vi.fn((table: string) => {
    if (table === 'issue_reports') {
      return {
        select,
        delete: vi.fn(() => ({ in: vi.fn(async () => ({ error: null })) })),
      }
    }

    if (table === 'issue_report_artifacts') {
      return {
        update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        select: vi.fn(() => ({ in: vi.fn(() => ({ is: vi.fn(async () => ({ data: [] })) })) })),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })

  const getSupabaseClient = vi.fn(() => ({ from }))
  const deleteIssueArtifact = vi.fn(async () => undefined)

  return { lte, inFilter, select, from, getSupabaseClient, deleteIssueArtifact }
})

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: mocks.getSupabaseClient,
}))

vi.mock('@/lib/issueReportStorage', () => ({
  deleteIssueArtifact: mocks.deleteIssueArtifact,
}))

import { GET } from '@/app/api/cron/issue-reports/cleanup/route'

describe('GET /api/cron/issue-reports/cleanup', () => {
  const originalSecret = process.env.CRON_SECRET

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.lte
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
  })

  afterAll(() => {
    process.env.CRON_SECRET = originalSecret
  })

  it('returns 401 when cron secret is configured and authorization is missing', async () => {
    process.env.CRON_SECRET = 'cron-secret'

    const response = await GET(new Request('http://localhost/api/cron/issue-reports/cleanup'))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
  })

  it('returns semantic cleanup summary when authorized', async () => {
    process.env.CRON_SECRET = 'cron-secret'

    const response = await GET(
      new Request('http://localhost/api/cron/issue-reports/cleanup', {
        headers: { authorization: 'Bearer cron-secret' },
      }),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      deletedArtifactCount: 0,
      deletedTicketCount: 0,
      retention: {
        artifactDays: 30,
        ticketDays: 60,
      },
    })
  })
})
