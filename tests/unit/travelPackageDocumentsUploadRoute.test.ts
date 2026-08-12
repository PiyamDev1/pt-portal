import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enforceRateLimit } from '@/lib/security/rateLimit'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const packageSingle = vi.fn()
  const packageEq = vi.fn(() => ({ single: packageSingle }))
  const packageSelect = vi.fn(() => ({ eq: packageEq }))
  const from = vi.fn((table: string) => {
    if (table === 'travel_packages') return { select: packageSelect }
    throw new Error(`Unexpected table: ${table}`)
  })
  const minioSend = vi.fn()

  return { getUser, packageSingle, from, minioSend }
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

vi.mock('@/lib/packageIntegrations', () => ({
  getPackageBackupStorageClient: vi.fn(),
  getPackageBackupStorageConfig: vi.fn(() => null),
  getPackageMinioBucketName: vi.fn(() => 'portal-documents'),
}))

vi.mock('@/lib/packageAudit', () => ({ recordPackageAuditEvent: vi.fn() }))

import { POST } from '@/app/api/travel-packages/[id]/documents/route'

function uploadRequest(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('category', 'flight')
  return {
    headers: new Headers(),
    formData: async () => formData,
  } as Request
}

const context = { params: Promise.resolve({ id: 'package-1' }) }

describe('POST /api/travel-packages/[id]/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: true,
      remaining: 19,
      retryAfterSeconds: 0,
    })
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff-1' } } })
    mocks.packageSingle.mockResolvedValue({
      data: {
        id: 'package-1',
        package_reference: 'PKG-1',
        source_quote_id: null,
        minio_bucket: 'portal-documents',
        minio_prefix: 'PKG-1/',
      },
      error: null,
    })
  })

  it('rejects spoofed document content before object storage', async () => {
    const response = await POST(
      uploadRequest(new File(['not a pdf'], 'itinerary.pdf', { type: 'application/pdf' })) as never,
      context,
    )
    const payload = await response.json()

    expect(response.status).toBe(415)
    expect(payload.error).toMatch(/content/i)
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('applies the shared rate limiter before looking up package data', async () => {
    vi.mocked(enforceRateLimit).mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 60,
      response: Response.json({ error: 'Too many uploads' }, { status: 429 }) as never,
    })

    const response = await POST(
      uploadRequest(new File(['not a pdf'], 'itinerary.pdf', { type: 'application/pdf' })) as never,
      context,
    )

    expect(response.status).toBe(429)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })

  it('rejects oversized multipart requests before parsing form data', async () => {
    const response = await POST(
      new Request('http://localhost/api/travel-packages/package-1/documents', {
        method: 'POST',
        headers: { 'content-length': String(3 * 1024 * 1024) },
      }) as never,
      context,
    )

    expect(response.status).toBe(413)
    expect(mocks.from).not.toHaveBeenCalled()
    expect(mocks.minioSend).not.toHaveBeenCalled()
  })
})
