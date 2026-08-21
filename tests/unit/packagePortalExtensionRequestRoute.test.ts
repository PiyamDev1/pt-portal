import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const enforceRateLimit = vi.fn()
  const maybePackage = vi.fn()
  const maybeExistingTask = vi.fn()
  const singleTask = vi.fn()
  const insertTask = vi.fn(() => ({ select: vi.fn(() => ({ single: singleTask })) }))
  const insertAudit = vi.fn()

  const packageQuery = {
    eq: vi.fn(() => ({ maybeSingle: maybePackage })),
    ilike: vi.fn(() => ({ maybeSingle: maybePackage })),
  }
  const existingTaskQuery = {
    eq: vi.fn(),
    in: vi.fn(),
    limit: vi.fn(),
    maybeSingle: maybeExistingTask,
  }
  existingTaskQuery.eq.mockReturnValue(existingTaskQuery)
  existingTaskQuery.in.mockReturnValue(existingTaskQuery)
  existingTaskQuery.limit.mockReturnValue(existingTaskQuery)

  const from = vi.fn((table: string) => {
    if (table === 'travel_packages') return { select: vi.fn(() => packageQuery) }
    if (table === 'travel_package_tasks') {
      return {
        select: vi.fn(() => existingTaskQuery),
        insert: insertTask,
      }
    }
    if (table === 'travel_package_audit_events') return { insert: insertAudit }
    return {}
  })

  return {
    enforceRateLimit,
    maybePackage,
    maybeExistingTask,
    singleTask,
    insertTask,
    insertAudit,
    packageQuery,
    existingTaskQuery,
    from,
  }
})

vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '203.0.113.8',
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: () => ({ from: mocks.from }),
}))

import { POST } from '@/app/api/package-portal/extension-request/route'

function makeRequest(body: unknown = {}, token = '') {
  return new Request('http://localhost/api/package-portal/extension-request', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

describe('package portal extension request route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true })
    mocks.maybePackage.mockResolvedValue({
      data: {
        id: 'package-1',
        package_reference: 'PT-H29GPX',
        customer_name: 'Ada Smith',
        customer_access_last_name: 'Smith',
        document_access_enabled: true,
        document_access_expires_at: '2026-09-01T00:00:00.000Z',
      },
      error: null,
    })
    mocks.maybeExistingTask.mockResolvedValue({ data: null, error: null })
    mocks.singleTask.mockResolvedValue({ data: { id: 'task-1' }, error: null })
    mocks.insertAudit.mockResolvedValue({ error: null })
  })

  it('creates one staff task for a valid bearer token without returning package data', async () => {
    const response = await POST(makeRequest({}, 'opaque-token-123') as never)
    const body = await response.json()

    expect(response.status).toBe(202)
    expect(body).toEqual({ requested: true, alreadyRequested: false })
    expect(mocks.packageQuery.eq).toHaveBeenCalledWith('document_access_token', 'opaque-token-123')
    expect(mocks.insertTask).toHaveBeenCalledWith(
      expect.objectContaining({
        package_id: 'package-1',
        task_type: 'portal_access_extension',
        source_rule: 'customer_portal_extension_request',
        assigned_to: null,
      }),
    )
    expect(mocks.insertAudit).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'customer_portal_extension_requested' }),
    )
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('accepts matching reference and surname for already-expired login access', async () => {
    const response = await POST(
      makeRequest({ reference: 'pt-h29gpx', lastName: ' Smith ' }) as never,
    )

    expect(response.status).toBe(202)
    expect(mocks.packageQuery.ilike).toHaveBeenCalledWith('package_reference', 'PT-H29GPX')
  })

  it('rejects a wrong surname without creating a staff task', async () => {
    const response = await POST(makeRequest({ reference: 'PT-H29GPX', lastName: 'Jones' }) as never)

    expect(response.status).toBe(404)
    expect(mocks.insertTask).not.toHaveBeenCalled()
  })

  it('deduplicates an existing open extension request', async () => {
    mocks.maybeExistingTask.mockResolvedValueOnce({
      data: { id: 'existing-task', status: 'open' },
      error: null,
    })

    const response = await POST(makeRequest({}, 'opaque-token-123') as never)

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ requested: true, alreadyRequested: true })
    expect(mocks.insertTask).not.toHaveBeenCalled()
  })

  it('requires a valid credential before querying IMS data', async () => {
    const response = await POST(makeRequest({ reference: 'bad', lastName: '' }) as never)

    expect(response.status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
