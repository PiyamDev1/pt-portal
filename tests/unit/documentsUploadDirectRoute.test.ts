import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DOCUMENT_MAX_FILE_SIZE_BYTES } from '@/lib/documentConstraints'

const mocks = vi.hoisted(() => {
  const minioSend = vi.fn()
  const r2Send = vi.fn()
  const insert = vi.fn()
  const getS3Client = vi.fn(() => ({ send: minioSend }))
  const getR2Client = vi.fn(() => ({ send: r2Send }))
  const isR2Configured = vi.fn(() => false)
  const getSupabaseClient = vi.fn(() => ({ from: vi.fn(() => ({ insert })) }))
  const documentScopeExists = vi.fn(() => Promise.resolve(true))
  const requireStaffSession = vi.fn()
  return {
    minioSend,
    r2Send,
    insert,
    getS3Client,
    getR2Client,
    isR2Configured,
    getSupabaseClient,
    documentScopeExists,
    requireStaffSession,
  }
})

vi.mock('@/lib/s3Client', () => ({ getS3Client: mocks.getS3Client }))
vi.mock('@/lib/r2Client', () => ({
  getR2Client: mocks.getR2Client,
  isR2Configured: mocks.isR2Configured,
}))
vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: mocks.getSupabaseClient }))
vi.mock('@/lib/documentAccess', () => ({ documentScopeExists: mocks.documentScopeExists }))
vi.mock('@/lib/auth/staffSession', () => ({ requireStaffSession: mocks.requireStaffSession }))

import { POST } from '@/app/api/documents/upload-direct/route'

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

describe('POST /api/documents/upload-direct', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'staff-1', email: 'staff@example.test' },
      employee: { id: 'staff-1' },
    })
    mocks.documentScopeExists.mockResolvedValue(true)
    mocks.insert.mockResolvedValue({ error: null })
    mocks.isR2Configured.mockReturnValue(false)
  })

  const makeFormRequest = (fd: FormData) => ({
    url: 'http://localhost/api/documents/upload-direct',
    method: 'POST',
    headers: new Headers(),
    formData: async () => fd,
  })

  it('rejects unauthenticated callers before reading the upload', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const res = await POST(makeFormRequest(new FormData()) as never)

    expect(res.status).toBe(401)
    expect(mocks.documentScopeExists).not.toHaveBeenCalled()
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('returns 400 when required fields are missing', async () => {
    const fd = new FormData()
    fd.append('familyHeadId', 'fh-1')

    const res = await POST(makeFormRequest(fd) as never)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body).toEqual({ error: 'Missing required fields' })
  })

  it('rejects an unknown document scope before storage', async () => {
    mocks.documentScopeExists.mockResolvedValue(false)
    const fd = new FormData()
    fd.append('file', new File([PDF_BYTES], 'doc.pdf', { type: 'application/pdf' }))
    fd.append('familyHeadId', 'fh-missing')

    const res = await POST(makeFormRequest(fd) as never)

    expect(res.status).toBe(404)
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('verifies content, uploads to MinIO, and records the staff actor', async () => {
    mocks.minioSend.mockResolvedValue({ ETag: 'etag-minio' })

    const fd = new FormData()
    fd.append('file', new File([PDF_BYTES], '../passport scan.pdf', { type: 'application/pdf' }))
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
        fileName: 'passport scan.pdf',
        fileType: 'application/pdf',
      }),
    )
    expect(body.documentId).toMatch(/^doc-/)
    expect(body.minioKey).toContain('family-fh-1/general/doc-')
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        uploaded_by: 'staff-1',
        family_head_id: 'fh-1',
        file_type: 'application/pdf',
        deleted: false,
      }),
    )
  })

  it('rejects a spoofed MIME type before storage', async () => {
    const fd = new FormData()
    fd.append('file', new File(['not a pdf'], 'document.pdf', { type: 'application/pdf' }))
    fd.append('familyHeadId', 'fh-1')

    const res = await POST(makeFormRequest(fd) as never)
    const body = await res.json()

    expect(res.status).toBe(415)
    expect(body.error).toMatch(/file content/i)
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('rejects files larger than the document size cap', async () => {
    const fd = new FormData()
    fd.append(
      'file',
      new File([new Uint8Array(DOCUMENT_MAX_FILE_SIZE_BYTES + 1)], 'big.pdf', {
        type: 'application/pdf',
      }),
    )
    fd.append('familyHeadId', 'fh-1')

    const res = await POST(makeFormRequest(fd) as never)
    const body = await res.json()

    expect(res.status).toBe(413)
    expect(body.error).toContain('File size exceeds maximum')
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('rejects obviously oversized multipart bodies before parsing form data', async () => {
    const res = await POST(
      new Request('http://localhost/api/documents/upload-direct', {
        method: 'POST',
        headers: { 'content-length': String(DOCUMENT_MAX_FILE_SIZE_BYTES + 512 * 1024) },
      }) as never,
    )
    const body = await res.json()

    expect(res.status).toBe(413)
    expect(body.error).toContain('File size exceeds maximum')
    expect(mocks.documentScopeExists).not.toHaveBeenCalled()
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('falls back to R2 and stores the actual bucket', async () => {
    mocks.minioSend.mockRejectedValue(new Error('minio down'))
    mocks.isR2Configured.mockReturnValue(true)
    mocks.r2Send.mockResolvedValue({ ETag: 'etag-r2' })

    const fd = new FormData()
    fd.append('file', new File([PDF_BYTES], 'doc.pdf', { type: 'application/pdf' }))
    fd.append('familyHeadId', 'fh-1')

    const res = await POST(makeFormRequest(fd) as never)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.storageProvider).toBe('r2')
    expect(body.etag).toBe('etag-r2')
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ minio_bucket: 'portal-fallback' }),
    )
  })

  it('removes the uploaded object when metadata persistence fails', async () => {
    mocks.minioSend.mockResolvedValueOnce({ ETag: 'etag-minio' }).mockResolvedValueOnce({})
    mocks.insert.mockResolvedValue({ error: { message: 'database unavailable' } })

    const fd = new FormData()
    fd.append('file', new File([PDF_BYTES], 'doc.pdf', { type: 'application/pdf' }))
    fd.append('familyHeadId', 'fh-1')

    const res = await POST(makeFormRequest(fd) as never)

    expect(res.status).toBe(500)
    expect(mocks.minioSend).toHaveBeenCalledTimes(2)
    expect(mocks.minioSend.mock.calls[1][0].constructor.name).toBe('DeleteObjectCommand')
  })
})
