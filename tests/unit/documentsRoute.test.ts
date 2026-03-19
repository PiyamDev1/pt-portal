import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const single = vi.fn()
  const range = vi.fn()
  const order = vi.fn(() => ({ range }))
  const eqCategory = vi.fn(() => ({ order }))
  const eqDeleted = vi.fn(() => ({ eq: eqCategory, order }))
  const eqFamily = vi.fn(() => ({ eq: eqDeleted }))
  const select = vi.fn(() => ({ eq: eqFamily }))
  const from = vi.fn(() => ({ select }))
  const getSupabaseClient = vi.fn(() => ({ from }))

  return { single, range, order, eqCategory, eqDeleted, eqFamily, select, from, getSupabaseClient }
})

vi.mock('@/lib/supabaseClient', () => ({ getSupabaseClient: mocks.getSupabaseClient }))

import { GET } from '@/app/api/documents/route'

const makeRequest = (params: Record<string, string> = {}) => {
  const url = new URL('http://localhost/api/documents')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new Request(url.toString()) as import('next/server').NextRequest
}

describe('GET /api/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSupabaseClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ eq: mocks.eqFamily })
    mocks.eqFamily.mockReturnValue({ eq: mocks.eqDeleted })
    mocks.eqDeleted.mockReturnValue({ eq: mocks.eqCategory, order: mocks.order })
    mocks.eqCategory.mockReturnValue({ order: mocks.order })
    mocks.order.mockReturnValue({ range: mocks.range })
  })

  it('returns 400 when familyHeadId is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/familyHeadId is required/i)
  })

  it('returns 500 when the Supabase query fails', async () => {
    mocks.range.mockResolvedValue({ data: null, error: { message: 'db error' }, count: null })
    const res = await GET(makeRequest({ familyHeadId: 'fh-1' }))
    expect(res.status).toBe(500)
  })

  it('returns paginated documents on success', async () => {
    const fakeDoc = {
      id: 'doc-1',
      file_name: 'passport.pdf',
      file_size: 1024,
      file_type: 'application/pdf',
      category: 'identity',
      uploaded_at: '2025-01-01T00:00:00Z',
      uploaded_by: 'u-1',
      family_head_id: 'fh-1',
      minio_bucket: 'docs',
      minio_key: 'passport.pdf',
      minio_etag: 'etag-123',
    }
    mocks.range.mockResolvedValue({ data: [fakeDoc], error: null, count: 1 })
    const res = await GET(makeRequest({ familyHeadId: 'fh-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.documents).toHaveLength(1)
    expect(body.documents[0].fileName).toBe('passport.pdf')
    expect(body.documents[0].minio.bucket).toBe('docs')
    expect(body.pagination.total).toBe(1)
  })
})
