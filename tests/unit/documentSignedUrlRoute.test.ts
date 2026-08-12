import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSignedDocumentPreviewUrl: vi.fn(),
  getSignedDocumentUrlByKey: vi.fn(),
  requireStaffSession: vi.fn(),
}))

vi.mock('@/lib/services/documentServer', () => ({
  getSignedDocumentPreviewUrl: mocks.getSignedDocumentPreviewUrl,
  getSignedDocumentUrlByKey: mocks.getSignedDocumentUrlByKey,
}))
vi.mock('@/lib/auth/staffSession', () => ({ requireStaffSession: mocks.requireStaffSession }))

import { GET } from '@/app/api/documents/signed-url/route'

describe('GET /api/documents/signed-url', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'staff-1' },
      employee: { id: 'staff-1' },
    })
  })

  it('requires an authenticated staff caller', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(new Request('http://localhost/api/documents/signed-url'))

    expect(response.status).toBe(401)
    expect(mocks.getSignedDocumentPreviewUrl).not.toHaveBeenCalled()
  })

  it('returns 400 when document identity is missing', async () => {
    const response = await GET(new Request('http://localhost/api/documents/signed-url'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Missing documentId parameter' })
  })

  it('returns a signed URL for a live document ID', async () => {
    mocks.getSignedDocumentPreviewUrl.mockResolvedValue('https://signed.example/url')

    const response = await GET(
      new Request('http://localhost/api/documents/signed-url?documentId=doc-1'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(payload).toEqual({ url: 'https://signed.example/url' })
    expect(mocks.getSignedDocumentPreviewUrl).toHaveBeenCalledWith('doc-1')
  })

  it('resolves a legacy key through the document database helper', async () => {
    mocks.getSignedDocumentUrlByKey.mockResolvedValue('https://signed.example/legacy')

    const response = await GET(
      new Request('http://localhost/api/documents/signed-url?key=family/abc.pdf'),
    )

    expect(response.status).toBe(200)
    expect(mocks.getSignedDocumentUrlByKey).toHaveBeenCalledWith('family/abc.pdf')
  })
})
