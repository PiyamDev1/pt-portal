import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const minioSend = vi.fn()
  const r2Send = vi.fn()
  const getS3Client = vi.fn(() => ({ send: minioSend }))
  const getR2Client = vi.fn(() => ({ send: r2Send }))
  const isR2Configured = vi.fn(() => false)
  return { minioSend, r2Send, getS3Client, getR2Client, isR2Configured }
})

vi.mock('@/lib/s3Client', () => ({
  getS3Client: mocks.getS3Client,
}))

vi.mock('@/lib/r2Client', () => ({
  getR2Client: mocks.getR2Client,
  isR2Configured: mocks.isR2Configured,
}))

import { POST } from '@/app/api/documents/upload-direct/route'

describe('POST /api/documents/upload-direct', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const makeFormRequest = (fd: FormData) =>
    new Request('http://localhost/api/documents/upload-direct', {
      method: 'POST',
      body: fd,
    })

  it('returns 400 when required fields are missing', async () => {
    const fd = new FormData()
    fd.append('familyHeadId', 'fh-1')

    const res = await POST(makeFormRequest(fd) as never)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: 'Missing required fields' })
  })

  it('uploads to MinIO and returns semantic payload', async () => {
    mocks.minioSend.mockResolvedValue({ ETag: 'etag-minio' })

    const fd = new FormData()
    fd.append('file', new File(['abc'], 'doc.pdf', { type: 'application/pdf' }))
    fd.append('familyHeadId', 'fh-1')
    fd.append('category', 'general')

    const res = await POST(makeFormRequest(fd) as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(
      expect.objectContaining({
        etag: 'etag-minio',
        storageProvider: 'minio',
        familyHeadId: 'fh-1',
        fileType: 'application/pdf',
      }),
    )
    expect(body.documentId).toMatch(/^doc-/)
    expect(body.minioKey).toContain('family-fh-1/general/')
  })

  it('falls back to R2 when MinIO fails and R2 is configured', async () => {
    mocks.minioSend.mockRejectedValue(new Error('minio down'))
    mocks.isR2Configured.mockReturnValue(true)
    mocks.r2Send.mockResolvedValue({ ETag: 'etag-r2' })

    const fd = new FormData()
    fd.append('file', new File(['abc'], 'doc.pdf', { type: 'application/pdf' }))
    fd.append('familyHeadId', 'fh-1')

    const res = await POST(makeFormRequest(fd) as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.storageProvider).toBe('r2')
    expect(body.etag).toBe('etag-r2')
  })
})
