import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser } }))
  const recordAuthSecurityEvent = vi.fn()

  return { getUser, getRouteSupabaseClient, recordAuthSecurityEvent }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))
vi.mock('@/lib/auth/securityEvents', () => ({
  recordAuthSecurityEvent: mocks.recordAuthSecurityEvent,
}))

import { POST } from '@/app/api/auth/consume-backup-code/route'
import { consumeBackupCodeAtomically } from '@/lib/auth/freshSecondFactor'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/consume-backup-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/auth/consume-backup-code', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(consumeBackupCodeAtomically).mockResolvedValue({
      consumed: true,
      codeId: 'c-2',
    })
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u-1', email: 'user@example.com' } },
      error: null,
    })
  })

  it('returns 401 when the user is not authenticated', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null })
    const res = await POST(makeRequest({ code: 'ABCD' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when code is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 503 when backup code verification is unavailable', async () => {
    vi.mocked(consumeBackupCodeAtomically).mockResolvedValueOnce({
      consumed: false,
      error: 'Unable to verify backup code',
      unavailable: true,
    })
    const res = await POST(makeRequest({ code: 'ABCD' }))
    expect(res.status).toBe(503)
  })

  it('returns 200 after the shared helper atomically consumes a code', async () => {
    const res = await POST(makeRequest({ code: 'ABCD-EFGH' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ consumedCodeId: 'c-2' })
    expect(consumeBackupCodeAtomically).toHaveBeenCalledWith('u-1', 'ABCD-EFGH')
  })

  it('returns 400 when no valid unused code matches', async () => {
    vi.mocked(consumeBackupCodeAtomically).mockResolvedValueOnce({
      consumed: false,
      error: 'Invalid or used backup code',
    })

    const res = await POST(makeRequest({ code: 'BAD' }))
    expect(res.status).toBe(400)
  })
})
