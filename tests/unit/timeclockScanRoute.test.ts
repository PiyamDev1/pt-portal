import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  // Set env vars before module import so module-level constants are populated
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

  const getSession = vi.fn()
  const supabaseAnonInstance = { auth: { getSession } }
  const createServerClient = vi.fn(() => supabaseAnonInstance)
  const adminFrom = vi.fn()
  const createClient = vi.fn(() => ({ from: adminFrom }))
  const cookies = vi.fn(async () => ({ getAll: () => [] }))
  return { getSession, createServerClient, adminFrom, createClient, cookies }
})

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createServerClient: mocks.createServerClient,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: mocks.createClient,
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
  headers: vi.fn(async () => ({ get: () => null })),
}))

import { POST } from '@/app/api/timeclock/scan/route'

const validPayload = JSON.stringify({
  qrText: JSON.stringify({
    v: 1,
    device_id: 'dev-1',
    ts: Math.floor(Date.now() / 1000),
    nonce: 'abc',
    sig: 'xyz',
  }),
})

const makeRequest = (body: string) =>
  new Request('http://localhost/api/timeclock/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

describe('/api/timeclock/scan route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore createClient and createServerClient implementations after clearAllMocks
    mocks.createClient.mockReturnValue({ from: mocks.adminFrom })
    mocks.createServerClient.mockReturnValue({ auth: { getSession: mocks.getSession } })
  })

  it('returns 401 when session is missing', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })

    const response = await POST(makeRequest(validPayload))
    const payload = await response.json()

    expect(response.status).toBe(401)
    expect(payload).toEqual({ error: 'Unauthorized' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('returns 400 when qrText is empty (unparseable)', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })

    const response = await POST(makeRequest(JSON.stringify({ qrText: '' })))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Invalid QR payload' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('returns 400 when QR payload is missing required fields', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    const bad = JSON.stringify({ v: 2, device_id: 'dev-1', ts: 0, nonce: 'x', sig: 'y' })

    const response = await POST(makeRequest(JSON.stringify({ qrText: bad })))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'QR payload missing required fields' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('returns 400 when device timestamp is invalid', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    const bad = JSON.stringify({ v: 1, device_id: 'dev-1', ts: NaN, nonce: 'x', sig: 'y' })

    const response = await POST(makeRequest(JSON.stringify({ qrText: bad })))
    const payload = await response.json()

    expect(response.status).toBe(400)
    expect(payload).toEqual({ error: 'Invalid device timestamp' })
    expect(mocks.adminFrom).not.toHaveBeenCalled()
  })

  it('returns 404 when device is not found in DB', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    const single = vi.fn(async () => ({ data: null, error: { message: 'not found' } }))
    const eq = vi.fn(() => ({ single }))
    const select = vi.fn(() => ({ eq }))
    mocks.adminFrom.mockImplementation(() => ({ select }))

    const freshTs = Math.floor(Date.now() / 1000)
    const good = JSON.stringify({ v: 1, device_id: 'dev-1', ts: freshTs, nonce: 'x', sig: 'y' })

    const response = await POST(makeRequest(JSON.stringify({ qrText: good })))
    const payload = await response.json()

    expect(response.status).toBe(404)
    expect(payload).toEqual({ error: 'Device not found' })
  })
})
