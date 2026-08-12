import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const reportSingle = vi.fn()
  const reportSelect = vi.fn(() => ({ single: reportSingle }))
  const reportInsert = vi.fn(() => ({ select: reportSelect }))
  const reportUpdateEq = vi.fn()
  const reportUpdate = vi.fn(() => ({ eq: reportUpdateEq }))
  const artifactsInsert = vi.fn()
  const eventsInsert = vi.fn()
  const parseDataUrl = vi.fn()
  const uploadIssueArtifact = vi.fn()

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
    parseDataUrl,
    uploadIssueArtifact,
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
  uploadIssueArtifact: mocks.uploadIssueArtifact,
}))

vi.mock('@/lib/issueReportUtils', () => ({
  deriveModuleFromPath: vi.fn(() => 'settings'),
  normalizeIssueNotes: vi.fn((value: unknown) => (typeof value === 'string' ? value.trim() : '')),
  normalizeSeverity: vi.fn(() => 'medium'),
  parseDataUrl: mocks.parseDataUrl,
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
    mocks.uploadIssueArtifact.mockResolvedValue({
      provider: 'minio',
      bucket: 'issue-reports',
      key: 'issue-reports/ticket-1/screenshot.png',
      size: 8,
    })
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

  it('rejects an oversized report body before parsing or persistence', async () => {
    const request = new Request('http://localhost/api/issue-reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'content-length': String(9 * 1024 * 1024),
      },
      body: '{}',
    })

    const response = await POST(request)

    expect(response.status).toBe(413)
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

  it('rejects screenshot content that does not match a supported image signature', async () => {
    mocks.parseDataUrl.mockReturnValue({
      contentType: 'image/svg+xml',
      buffer: Buffer.from('<svg></svg>'),
    })

    const request = new Request('http://localhost/api/issue-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: 'Screenshot is attached',
        pageUrl: 'http://localhost/dashboard/settings',
        routePath: '/dashboard/settings',
        includeScreenshot: true,
        screenshotDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(415)
    expect(mocks.reportInsert).not.toHaveBeenCalled()
    expect(mocks.uploadIssueArtifact).not.toHaveBeenCalled()
  })

  it('stores a screenshot using its detected content type', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    mocks.parseDataUrl.mockReturnValue({ contentType: 'image/png', buffer: pngBytes })

    const request = new Request('http://localhost/api/issue-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: 'Screenshot is attached',
        pageUrl: 'http://localhost/dashboard/settings',
        routePath: '/dashboard/settings',
        includeScreenshot: true,
        screenshotDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(200)
    expect(mocks.uploadIssueArtifact).toHaveBeenCalledWith(
      expect.objectContaining({ body: pngBytes, contentType: 'image/png' }),
    )
    expect(mocks.artifactsInsert).toHaveBeenCalledWith([
      expect.objectContaining({ content_type: 'image/png' }),
    ])
  })
})
