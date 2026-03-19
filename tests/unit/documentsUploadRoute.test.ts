import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getSignedUrl = vi.fn()
  const getS3Client = vi.fn(() => ({ client: 's3' }))
  return { getSignedUrl, getS3Client }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mocks.getSignedUrl,
}))

vi.mock('@/lib/s3Client', () => ({
  getS3Client: mocks.getS3Client,
}))

import { POST } from '@/app/api/documents/upload/route'

describe('POST /api/documents/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSignedUrl.mockResolvedValue('https://signed-upload.example/url')
  })

  it('returns 400 when required fields are missing', async () => {
    const req = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: 'x.pdf' }),
    })

    const res = await POST(req as never)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: 'Missing required fields' })
  })

  it('returns semantic signed upload payload on success', async () => {
    const req = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'passport scan.pdf',
        fileType: 'application/pdf',
        familyHeadId: 'fh-1',
        category: 'receipt',
      }),
    })

    const res = await POST(req as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(
      expect.objectContaining({
        uploadUrl: 'https://signed-upload.example/url',
        fileName: 'passport scan.pdf',
        fileType: 'application/pdf',
        category: 'receipt',
        familyHeadId: 'fh-1',
      }),
    )
    expect(body.documentId).toMatch(/^doc-/)
    expect(body.minioKey).toContain('family-fh-1/receipt/')
  })

  it('returns 500 when URL signing fails', async () => {
    mocks.getSignedUrl.mockRejectedValue(new Error('sign failed'))

    const req = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: 'x.pdf',
        fileType: 'application/pdf',
        familyHeadId: 'fh-1',
      }),
    })

    const res = await POST(req as never)
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.error).toBe('Failed to generate secure upload link')
    expect(body.details).toBe('sign failed')
  })
})
