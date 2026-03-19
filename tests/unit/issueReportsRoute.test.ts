import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const reportSingle = vi.fn()
  const reportSelect = vi.fn(() => ({ single: reportSingle }))
  const reportInsert = vi.fn(() => ({ select: reportSelect }))
  const reportUpdateEq = vi.fn()
  const reportUpdate = vi.fn(() => ({ eq: reportUpdateEq }))
  const artifactsInsert = vi.fn()
  const eventsInsert = vi.fn()

  const issueReportsTable = {
    insert: reportInsert,
    update: reportUpdate,
  }

  const issueReportArtifactsTable = {
    insert: artifactsInsert,
  }

  const issueReportEventsTable = {
    insert: eventsInsert,
  }

  const from = vi.fn((table: string) => {
    if (table === 'issue_reports') return issueReportsTable
    if (table === 'issue_report_artifacts') return issueReportArtifactsTable
    if (table === 'issue_report_events') return issueReportEventsTable
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
    reportSingle,
    reportInsert,
    reportUpdateEq,
    artifactsInsert,
    eventsInsert,
    from,
  }
})

vi.mock('@/lib/supabaseClient', () => ({
  getSupabaseClient: () => ({ from: mocks.from }),
}))

vi.mock('@/lib/issueReportAuth', () => ({
  getOptionalIssueReporter: vi.fn(async () => ({ id: 'user-1', email: 'a@b.com', name: 'Agent' })),
}))

vi.mock('@/lib/issueReportStorage', () => ({
  uploadIssueArtifact: vi.fn(),
}))

vi.mock('@/lib/issueReportUtils', () => ({
  deriveModuleFromPath: vi.fn(() => 'settings'),
  normalizeIssueNotes: vi.fn((value: unknown) => (typeof value === 'string' ? value.trim() : '')),
  normalizeSeverity: vi.fn(() => 'medium'),
  parseDataUrl: vi.fn(),
  redactSensitiveText: vi.fn((value: string) => value),
  sanitizeConsoleEntries: vi.fn(() => []),
  sanitizeFailedRequests: vi.fn(() => []),
}))

import { POST } from '@/app/api/issue-reports/route'

describe('POST /api/issue-reports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.reportSingle.mockResolvedValue({ data: { id: 'ticket-1' }, error: null })
    mocks.reportUpdateEq.mockResolvedValue({ error: null })
    mocks.artifactsInsert.mockResolvedValue({ error: null })
    mocks.eventsInsert.mockResolvedValue({ error: null })
  })

  it('returns 400 when notes are missing', async () => {
    const request = new Request('http://localhost/api/issue-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: '   ',
        pageUrl: 'http://localhost/dashboard',
        routePath: '/dashboard',
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload.error).toContain('describe what went wrong')
    expect(mocks.reportInsert).not.toHaveBeenCalled()
  })

  it('creates a ticket and returns id for valid payload', async () => {
    const request = new Request('http://localhost/api/issue-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: 'Screen flickers while saving',
        pageUrl: 'http://localhost/dashboard/settings',
        routePath: '/dashboard/settings',
        severity: 'medium',
        includeScreenshot: false,
        includeConsoleLog: false,
        includeFailedRequests: false,
        browserContext: { userAgent: 'test-agent' },
      }),
    })

    const response = await POST(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ ticketId: 'ticket-1' })
    expect(mocks.reportInsert).toHaveBeenCalledTimes(1)
    expect(mocks.eventsInsert).toHaveBeenCalledTimes(1)
  })
})
