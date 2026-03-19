import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const listFactors = vi.fn()
  const deleteFactor = vi.fn()

  const updateEq = vi.fn()
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ update }))

  const createClient = vi.fn(() => ({
    auth: { admin: { mfa: { listFactors, deleteFactor } } },
    from,
  }))

  return { listFactors, deleteFactor, updateEq, update, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { POST } from '@/app/api/auth/reset-2fa/route'

const makeRequest = (body: Record<string, unknown>) =>
  new Request('http://localhost/api/auth/reset-2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/auth/reset-2fa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'

    mocks.createClient.mockReturnValue({
      auth: {
        admin: { mfa: { listFactors: mocks.listFactors, deleteFactor: mocks.deleteFactor } },
      },
      from: mocks.from,
    })
    mocks.from.mockReturnValue({ update: mocks.update })
    mocks.update.mockReturnValue({ eq: mocks.updateEq })
  })

  it('returns 400 when userId is missing', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 500 when factor listing fails', async () => {
    mocks.listFactors.mockResolvedValue({ data: null, error: { message: 'list failed' } })
    const res = await POST(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(500)
  })

  it('returns 200 and resets factors + db flag on success', async () => {
    mocks.listFactors.mockResolvedValue({
      data: { factors: [{ id: 'f-1' }, { id: 'f-2' }] },
      error: null,
    })
    mocks.deleteFactor.mockResolvedValue({ error: null })
    mocks.updateEq.mockResolvedValue({ error: null })

    const res = await POST(makeRequest({ userId: 'u-1' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ resetUserId: 'u-1', removedFactors: 2 })
    expect(mocks.deleteFactor).toHaveBeenCalledTimes(2)
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'u-1')
  })
})
