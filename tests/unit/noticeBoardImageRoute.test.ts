import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const query: Record<string, ReturnType<typeof vi.fn>> = {}
  query.select = vi.fn(() => query)
  query.eq = vi.fn(() => query)
  query.limit = vi.fn(() => query)

  return {
    requireStaffSession: vi.fn(),
    from: vi.fn(() => query),
    maybeSingle,
    query,
    minioSend: vi.fn(),
    r2Send: vi.fn(),
    reportOperationalError: vi.fn(async () => 'request-123456'),
  }
})

mocks.query.maybeSingle = mocks.maybeSingle

vi.mock('@/lib/auth/staffSession', () => ({
  requireStaffSession: mocks.requireStaffSession,
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: vi.fn(() => ({ from: mocks.from })),
}))

vi.mock('@/lib/s3Client', () => ({
  getS3Client: vi.fn(() => ({ send: mocks.minioSend })),
}))

vi.mock('@/lib/r2Client', () => ({
  getR2Client: vi.fn(() => ({ send: mocks.r2Send })),
  isR2Configured: vi.fn(() => true),
}))

vi.mock('@/lib/observability/server', () => ({
  reportOperationalError: mocks.reportOperationalError,
  responseWithRequestId: (response: Response, requestId: string) => {
    response.headers.set('x-request-id', requestId)
    return response
  },
}))

import { GET } from '@/app/api/dashboard/notice-board/image/route'

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function imageRequest(query = 'key=notice-board%2Fimage.png') {
  return new NextRequest(`http://localhost/api/dashboard/notice-board/image?${query}`)
}

function storedSlide(overrides: Record<string, unknown> = {}) {
  return {
    image_storage_provider: 'minio',
    image_storage_bucket: 'portal-documents',
    image_storage_key: 'notice-board/image.png',
    ...overrides,
  }
}

describe('GET /api/dashboard/notice-board/image', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'staff-1', email: 'staff@example.com' },
      employee: { id: 'staff-1', fullName: 'Staff', role: 'Staff', departments: [] },
    })
    mocks.maybeSingle.mockResolvedValue({ data: storedSlide(), error: null })
    mocks.minioSend.mockResolvedValue({
      Body: { transformToByteArray: async () => PNG_BYTES },
      ContentType: 'image/png',
      ContentLength: PNG_BYTES.byteLength,
    })
  })

  it('requires an authenticated staff session', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(imageRequest())

    expect(response.status).toBe(401)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('returns 404 when the key does not belong to a saved slide', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await GET(imageRequest())

    expect(response.status).toBe(404)
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('ignores caller-supplied provider and bucket values and streams the saved object', async () => {
    const response = await GET(
      imageRequest('provider=r2&bucket=attacker-bucket&key=notice-board%2Fimage.png'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG_BYTES)
    expect(mocks.minioSend).toHaveBeenCalledTimes(1)
    expect(mocks.minioSend.mock.calls[0][0].input).toEqual({
      Bucket: 'portal-documents',
      Key: 'notice-board/image.png',
    })
    expect(mocks.r2Send).not.toHaveBeenCalled()
  })

  it('rejects a stored reference outside the configured notice buckets', async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: storedSlide({ image_storage_bucket: 'unexpected-bucket' }),
      error: null,
    })

    const response = await GET(imageRequest())

    expect(response.status).toBe(404)
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('returns a bounded generic error when storage is unavailable', async () => {
    mocks.minioSend.mockRejectedValue(new Error('secret storage detail'))

    const response = await GET(imageRequest())

    expect(response.status).toBe(502)
    expect(response.headers.get('x-request-id')).toBe('request-123456')
    await expect(response.json()).resolves.toEqual({
      error: 'Notice image is temporarily unavailable',
    })
    expect(mocks.reportOperationalError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'notice_board.image_read_failed' }),
    )
  })
})
