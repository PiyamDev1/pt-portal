import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const employeeSingle = vi.fn()
  const employeeEq = vi.fn(() => ({ single: employeeSingle }))
  const employeeSelect = vi.fn(() => ({ eq: employeeEq }))
  const from = vi.fn(() => ({ select: employeeSelect }))
  const minioSend = vi.fn()
  const r2Send = vi.fn()
  const reportOperationalError = vi.fn(async () => 'request-123456')

  return {
    getUser,
    employeeSingle,
    from,
    minioSend,
    r2Send,
    reportOperationalError,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  })),
}))

vi.mock('@/lib/s3Client', () => ({
  getS3Client: vi.fn(() => ({ send: mocks.minioSend })),
}))

vi.mock('@/lib/r2Client', () => ({
  getR2Client: vi.fn(() => ({ send: mocks.r2Send })),
  isR2Configured: vi.fn(() => false),
}))

vi.mock('@/lib/observability/server', () => ({
  reportOperationalError: mocks.reportOperationalError,
  responseWithRequestId: (response: Response, requestId: string) => {
    response.headers.set('x-request-id', requestId)
    return response
  },
}))

import { POST } from '@/app/api/admin/notice-board/upload/route'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function uploadRequest(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  return {
    headers: new Headers(),
    formData: async () => formData,
  } as Request
}

describe('POST /api/admin/notice-board/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mocks.employeeSingle.mockResolvedValue({ data: { roles: { name: 'Admin' } }, error: null })
    mocks.minioSend.mockResolvedValue({ ETag: 'etag-1' })
  })

  it('rejects spoofed image content before object storage', async () => {
    const response = await POST(
      uploadRequest(new File(['<svg></svg>'], 'notice.png', { type: 'image/png' })) as never,
    )

    expect(response.status).toBe(415)
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('rejects an extension that disagrees with detected image content', async () => {
    const response = await POST(
      uploadRequest(new File([PNG_BYTES], 'notice.jpg', { type: 'image/png' })) as never,
    )

    expect(response.status).toBe(415)
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('uploads supported image bytes with the detected MIME type', async () => {
    const response = await POST(
      uploadRequest(new File([PNG_BYTES], '../notice.png', { type: 'image/png' })) as never,
    )
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual(
      expect.objectContaining({
        imageUrl: expect.stringMatching(
          /^\/api\/dashboard\/notice-board\/image\?key=notice-board%2F/,
        ),
        fileName: 'notice.png',
        fileType: 'image/png',
      }),
    )
    expect(mocks.minioSend).toHaveBeenCalledTimes(1)
    expect(mocks.minioSend.mock.calls[0][0].input).toEqual(
      expect.objectContaining({ ContentType: 'image/png', Body: Buffer.from(PNG_BYTES) }),
    )
  })

  it('rejects obviously oversized multipart requests before parsing the body', async () => {
    const response = await POST(
      new Request('http://localhost/api/admin/notice-board/upload', {
        method: 'POST',
        headers: { 'content-length': String(6 * 1024 * 1024) },
      }) as never,
    )

    expect(response.status).toBe(413)
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('returns a generic retryable response when storage is unavailable', async () => {
    mocks.minioSend.mockRejectedValue(new Error('endpoint and credential details'))

    const response = await POST(
      uploadRequest(new File([PNG_BYTES], 'notice.png', { type: 'image/png' })) as never,
    )

    expect(response.status).toBe(503)
    expect(response.headers.get('x-request-id')).toBe('request-123456')
    await expect(response.json()).resolves.toEqual({
      error: 'Notice image storage is temporarily unavailable',
    })
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'notice_board.image_upload_failed' }),
    )
  })
})
