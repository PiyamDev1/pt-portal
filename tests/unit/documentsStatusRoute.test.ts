import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getDocumentStorageStatus = vi.fn()
  const requireStaffSession = vi.fn()
  return { getDocumentStorageStatus, requireStaffSession }
})

vi.mock('@/lib/documentStorageStatus', () => ({
  getDocumentStorageStatus: mocks.getDocumentStorageStatus,
}))
vi.mock('@/lib/auth/staffSession', () => ({ requireStaffSession: mocks.requireStaffSession }))

import { GET } from '@/app/api/documents/status/route'

describe('GET /api/documents/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'staff-1' },
      employee: { id: 'staff-1' },
    })
  })

  it('requires a staff session', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const res = await GET(new Request('http://localhost/api/documents/status') as never)

    expect(res.status).toBe(401)
    expect(mocks.getDocumentStorageStatus).not.toHaveBeenCalled()
  })

  it('returns status payload directly', async () => {
    mocks.getDocumentStorageStatus.mockResolvedValue({
      primary: { configured: true, connected: true },
      fallback: { configured: false, connected: false },
      mode: 'primary',
      uploadEnabled: true,
      previewDownloadEnabled: true,
      uploadOnlyFallback: false,
      timestamp: '2026-03-18T00:00:00.000Z',
    })

    const res = await GET(new Request('http://localhost/api/documents/status') as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({
      status: {
        primary: { configured: true, connected: true },
        fallback: { configured: false, connected: false },
        mode: 'primary',
        uploadEnabled: true,
        previewDownloadEnabled: true,
        uploadOnlyFallback: false,
        timestamp: '2026-03-18T00:00:00.000Z',
      },
    })
    expect(mocks.getDocumentStorageStatus).toHaveBeenCalledWith({ runMaintenance: true })
  })
})
