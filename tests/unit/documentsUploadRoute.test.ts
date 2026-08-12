import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ requireStaffSession: vi.fn() }))

vi.mock('@/lib/auth/staffSession', () => ({ requireStaffSession: mocks.requireStaffSession }))

import { POST } from '@/app/api/documents/upload/route'

describe('POST /api/documents/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireStaffSession.mockResolvedValue({
      authorized: true,
      user: { id: 'staff-1' },
      employee: { id: 'staff-1' },
    })
  })

  it('requires a staff session', async () => {
    mocks.requireStaffSession.mockResolvedValue({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(new Request('http://localhost/api/documents/upload') as never)
    expect(response.status).toBe(401)
  })

  it('disables unverified presigned uploads', async () => {
    const response = await POST(new Request('http://localhost/api/documents/upload') as never)
    const payload = await response.json()

    expect(response.status).toBe(410)
    expect(payload.error).toMatch(/upload-direct/)
  })
})
