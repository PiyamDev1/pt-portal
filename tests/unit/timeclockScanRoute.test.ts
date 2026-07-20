import crypto from 'node:crypto'
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
  const queueAttendanceSyncForEmployeeDay = vi.fn(async () => undefined)
  return {
    getSession,
    createServerClient,
    adminFrom,
    createClient,
    cookies,
    queueAttendanceSyncForEmployeeDay,
  }
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

vi.mock('@/lib/integrations/frappe/syncEngine', () => ({
  queueAttendanceSyncForEmployeeDay: mocks.queueAttendanceSyncForEmployeeDay,
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

const device = {
  id: 'cb9008f8-0098-4b46-b77b-b82029aff3f2',
  secret: 'device-secret',
  is_active: true,
}

function makeQueryChain(methods: string[], result: unknown): Record<string, unknown> {
  let next: unknown = Promise.resolve(result)
  for (const method of [...methods].reverse()) {
    const current = next
    next = { [method]: vi.fn(() => current) }
  }
  return next as Record<string, unknown>
}

function buildQrText({
  timestamp = Math.floor(Date.now() / 1000),
  nonce = 'nonce-1',
  secret = device.secret,
}: {
  timestamp?: number
  nonce?: string
  secret?: string
} = {}) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${device.id}.${timestamp}.${nonce}`)
    .digest('base64url')
  const payload = { v: 1, device_id: device.id, ts: timestamp, nonce, sig: signature }
  return `ptc1:${Buffer.from(JSON.stringify(payload)).toString('base64url')}`
}

function configureScanDatabase({
  deviceRow = device,
  nonceError = null,
}: {
  deviceRow?: typeof device
  nonceError?: { code: string } | null
} = {}) {
  mocks.adminFrom.mockImplementation((table: string) => {
    if (table === 'timeclock_devices') {
      return {
        select: vi.fn(() => makeQueryChain(['eq', 'single'], { data: deviceRow, error: null })),
      }
    }

    if (table === 'timeclock_qr_nonces') {
      return {
        delete: vi.fn(() => makeQueryChain(['eq', 'lt'], { data: null, error: null })),
        insert: vi.fn(async () => ({ data: null, error: nonceError })),
      }
    }

    if (table === 'timeclock_events') {
      return {
        select: vi.fn((columns: string) => {
          if (columns === 'hash') {
            return makeQueryChain(['eq', 'order', 'limit', 'maybeSingle'], {
              data: null,
              error: null,
            })
          }
          if (columns === 'punch_type') {
            return makeQueryChain(['eq', 'gte', 'lte', 'order', 'limit', 'maybeSingle'], {
              data: null,
              error: null,
            })
          }
          return makeQueryChain(['eq', 'eq', 'gte', 'order', 'limit', 'maybeSingle'], {
            data: null,
            error: null,
          })
        }),
        insert: vi.fn(() =>
          makeQueryChain(['select', 'single'], {
            data: {
              id: 'event-1',
              event_type: 'PUNCH',
              scanned_at: '2026-07-20T12:00:00.000Z',
            },
            error: null,
          }),
        ),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

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

  it('accepts a valid ptc1 payload and records the punch', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    configureScanDatabase()

    const response = await POST(makeRequest(JSON.stringify({ qrText: buildQrText() })))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      eventId: 'event-1',
      eventType: 'PUNCH',
      punchType: 'IN',
      scannedAt: '2026-07-20T12:00:00.000Z',
    })
    expect(mocks.queueAttendanceSyncForEmployeeDay).toHaveBeenCalledWith('u-1', '2026-07-20')
  })

  it('rejects an inactive device', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    configureScanDatabase({ deviceRow: { ...device, is_active: false } })

    const response = await POST(makeRequest(JSON.stringify({ qrText: buildQrText() })))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'Device inactive' })
  })

  it('rejects an expired QR timestamp', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    configureScanDatabase()

    const qrText = buildQrText({ timestamp: Math.floor(Date.now() / 1000) - 121 })
    const response = await POST(makeRequest(JSON.stringify({ qrText })))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'QR expired' })
  })

  it('rejects an invalid QR signature', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    configureScanDatabase()

    const response = await POST(
      makeRequest(JSON.stringify({ qrText: buildQrText({ secret: 'wrong-secret' }) })),
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid signature' })
  })

  it('rejects a QR nonce that has already been used', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u-1' } } },
    })
    configureScanDatabase({ nonceError: { code: '23505' } })

    const response = await POST(makeRequest(JSON.stringify({ qrText: buildQrText() })))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'QR already used' })
  })
})
