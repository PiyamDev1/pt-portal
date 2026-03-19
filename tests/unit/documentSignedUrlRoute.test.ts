import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getSignedDocumentPreviewUrl = vi.fn()
  return { getSignedDocumentPreviewUrl }
})

vi.mock('@/lib/services/documentServer', () => ({
  getSignedDocumentPreviewUrl: mocks.getSignedDocumentPreviewUrl,
}))

import { GET } from '@/app/api/documents/signed-url/route'

describe('GET /api/documents/signed-url', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 400 when key query parameter is missing', async () => {
    const response = await GET(new Request('http://localhost/api/documents/signed-url'))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Missing key parameter' })
  })

  it('returns signed URL for valid key', async () => {
    mocks.getSignedDocumentPreviewUrl.mockResolvedValue('https://signed.example/url')

    const response = await GET(
      new Request('http://localhost/api/documents/signed-url?key=family/abc.pdf'),
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({ url: 'https://signed.example/url' })
    expect(mocks.getSignedDocumentPreviewUrl).toHaveBeenCalledWith('family/abc.pdf')
  })
})
