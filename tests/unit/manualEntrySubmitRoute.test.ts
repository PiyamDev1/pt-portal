import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'

  const getSession = vi.fn()

  // adminSupabase chains
  const adminMaybeSingle = vi.fn()
  const adminLimit = vi.fn(() => ({ maybeSingle: adminMaybeSingle }))
  const adminOrderEvents = vi.fn(() => ({ limit: adminLimit }))
  const adminGte = vi.fn(() => ({
    lte: vi.fn(() => ({ order: adminOrderEvents, limit: adminLimit })),
  }))
  const adminEqPunch = vi.fn(() => ({ gte: adminGte }))
  const adminEqEmployee = vi.fn(() => ({ eq: adminEqPunch }))
  const adminEqDevice = vi.fn(() => ({ order: adminOrderEvents }))
  const adminSelectHash = vi.fn(() => ({ eq: adminEqDevice }))

  const adminInsertSingle = vi.fn()
  const adminInsertSelect = vi.fn(() => ({ single: adminInsertSingle }))
  const adminInsert = vi.fn(() => ({ select: adminInsertSelect }))

  const adminDeleteEq = vi.fn(async () => ({ error: null }))
  const adminDelete = vi.fn(() => ({ eq: adminDeleteEq }))

  const adminSelectCode = vi.fn()
  const adminEqCode = vi.fn(() => ({ maybeSingle: adminSelectCode }))
  const adminSelectCodeFn = vi.fn(() => ({ eq: adminEqCode }))

  const adminFrom = vi.fn((table: string) => {
    if (table === 'timeclock_manual_codes') {
      return { select: adminSelectCodeFn, delete: adminDelete }
    }
    if (table === 'timeclock_events') {
      return { select: adminSelectHash, insert: adminInsert }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from: adminFrom }))
  const createServerClient = vi.fn(() => ({ auth: { getSession } }))

  return {
    getSession,
    adminMaybeSingle,
    adminSelectCode,
    adminEqCode,
    adminSelectCodeFn,
    adminInsertSingle,
    adminFrom,
    createClient,
    createServerClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createServerClient: mocks.createServerClient }))
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
  headers: vi.fn(async () => ({ get: () => '' })),
}))

import { POST } from '@/app/api/timeclock/manual-entry/submit/route'

const makeRequest = (body: Record<string, unknown> = {}) =>
  new Request('http://localhost/api/timeclock/manual-entry/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

function makeEventsFromChain() {
  const maybeSingleFn = vi.fn(async () => ({ data: null }))
  const limitFn = vi.fn(() => ({ maybeSingle: maybeSingleFn }))
  const orderFn = vi.fn(() => ({ limit: limitFn }))
  const eqFn2 = vi.fn(() => ({ order: orderFn, limit: limitFn }))
  const eqFn1 = vi.fn(() => ({ eq: eqFn2 }))
  const selectFn = vi.fn(() => ({ eq: eqFn1 }))
  return {
    select: selectFn,
    insert: vi.fn(() => ({ select: vi.fn(() => ({ single: mocks.adminInsertSingle })) })),
  }
}

describe('POST /api/timeclock/manual-entry/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createClient.mockReturnValue({ from: mocks.adminFrom })
    mocks.createServerClient.mockReturnValue({ auth: { getSession: mocks.getSession } })
    mocks.adminFrom.mockImplementation(((table: string) => {
      if (table === 'timeclock_manual_codes') {
        return {
          select: mocks.adminSelectCodeFn,
          delete: vi.fn(() => ({ eq: vi.fn(async () => ({})) })),
        }
      }
      if (table === 'timeclock_events') {
        return makeEventsFromChain()
      }
      return {}
    }) as any)
    mocks.adminSelectCodeFn.mockReturnValue({ eq: mocks.adminEqCode })
    mocks.adminEqCode.mockReturnValue({ maybeSingle: mocks.adminSelectCode })
  })

  it('returns 401 when not authenticated', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } })
    const res = await POST(makeRequest({ code: '12345678' }))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toMatch(/unauthorized/i)
  })

  it('returns 400 for invalid code format', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } })
    const res = await POST(makeRequest({ code: 'abc' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid code format/i)
  })

  it('returns 404 when code is not found in database', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } })
    mocks.adminSelectCode.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest({ code: '12345678' }))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toMatch(/invalid code/i)
  })

  it('returns 400 when code has expired', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'u-1' } } } })
    const pastTime = new Date(Date.now() - 60_000).toISOString()
    mocks.adminSelectCode.mockResolvedValue({
      data: { device_id: 'dev-1', qr_payload: '{}', expires_at: pastTime },
      error: null,
    })
    const res = await POST(makeRequest({ code: '12345678' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/expired/i)
  })
})
