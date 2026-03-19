import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getDocumentStorageStatus = vi.fn()
  return { getDocumentStorageStatus }
})

vi.mock('@/lib/documentStorageStatus', () => ({
  getDocumentStorageStatus: mocks.getDocumentStorageStatus,
}))

import { GET } from '@/app/api/documents/status/route'

describe('GET /api/documents/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
