import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireMaintenanceSession: vi.fn(),
  enforceRateLimit: vi.fn(),
  insert: vi.fn(),
  single: vi.fn(),
}))

vi.mock('@/lib/adminSessionAuth', () => ({
  requireMaintenanceSession: mocks.requireMaintenanceSession,
}))

vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: vi.fn(() => '127.0.0.1'),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: mocks.insert,
    })),
  })),
}))

vi.mock('@/lib/observability/server', () => ({
  logServerEvent: vi.fn(),
  reportOperationalError: vi.fn(async () => 'request-123456'),
  responseWithRequestId: (response: Response, requestId: string) => {
    response.headers.set('x-request-id', requestId)
    return response
  },
}))

import { POST } from '@/app/api/admin/notice-board/route'

function postRequest(body: unknown) {
  return new Request('http://localhost/api/admin/notice-board', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/notice-board', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireMaintenanceSession.mockResolvedValue({
      authorized: true,
      user: { id: 'admin-1', email: 'admin@example.com' },
      employee: { id: 'admin-1', fullName: 'Admin', role: 'Admin', departments: [] },
    })
    mocks.enforceRateLimit.mockResolvedValue({ allowed: true, response: null })
    mocks.insert.mockReturnValue({
      select: vi.fn(() => ({ single: mocks.single })),
    })
    mocks.single.mockResolvedValue({
      data: { id: 'slide-1', title: 'Office update' },
      error: null,
    })
  })

  it('accepts a minimal useful notice and applies safe defaults', async () => {
    const response = await POST(postRequest({ title: ' Office update ' }))

    expect(response.status).toBe(201)
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Office update',
        body: null,
        display_seconds: 6,
        sort_order: 0,
        is_active: true,
        created_by: 'admin-1',
      }),
    )
  })

  it('rejects an empty slide before database access', async () => {
    const response = await POST(postRequest({}))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Add a title, message, or image' })
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects unsafe links before database access', async () => {
    const response = await POST(
      postRequest({ title: 'Unsafe link', hyperlink_url: 'javascript:alert(1)' }),
    )

    expect(response.status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects incomplete stored-image metadata', async () => {
    const response = await POST(
      postRequest({
        title: 'Image',
        image_url: '/api/dashboard/notice-board/image?key=notice-board%2Fimage.png',
        image_storage_provider: 'minio',
      }),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Stored images require provider, bucket, and key metadata',
    })
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
