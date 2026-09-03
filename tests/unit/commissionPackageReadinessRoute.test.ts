import { beforeEach, describe, expect, it, vi } from 'vitest'

const PACKAGE_ID = '60000000-0000-4000-8000-000000000101'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const maybeSingle = vi.fn()
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  const rpc = vi.fn()
  const getRouteSupabaseClient = vi.fn(async () => ({ auth: { getUser }, from }))
  const getServiceSupabaseClient = vi.fn(() => ({ rpc }))

  return {
    getUser,
    maybeSingle,
    eq,
    select,
    from,
    rpc,
    getRouteSupabaseClient,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { GET } from '@/app/api/travel-packages/[id]/commission-readiness/route'

function request() {
  return new Request(`http://localhost/api/travel-packages/${PACKAGE_ID}/commission-readiness`)
}

const readiness = {
  stage: 'closed',
  state: 'processed',
  handoffReady: true,
  authoritative: true,
  issues: [],
  passengerCount: 3,
  reservationCount: 4,
  calculationRowCount: 2,
  invoiceReferenceRowCount: 2,
  eventVersion: 1,
  eventStatus: 'processed',
  eventError: null,
  eventUpdatedAt: '2026-08-30T12:00:00.000Z',
  snapshotCurrent: true,
}

describe('GET Package Commission readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.maybeSingle.mockResolvedValue({ data: { id: PACKAGE_ID }, error: null })
    mocks.rpc.mockImplementation(async (functionName: string) =>
      functionName === 'commission_schema_status'
        ? { data: { ready: true, version: 2026090301, mode: 'shadow' }, error: null }
        : { data: readiness, error: null },
    )
  })

  it('requires an authenticated staff session', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })

    const response = await GET(request() as never, {
      params: Promise.resolve({ id: PACKAGE_ID }),
    })

    expect(response.status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('does not reveal readiness for a package hidden by RLS', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null })

    const response = await GET(request() as never, {
      params: Promise.resolve({ id: PACKAGE_ID }),
    })

    expect(response.status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns only the redacted readiness contract with private caching', async () => {
    const response = await GET(request() as never, {
      params: Promise.resolve({ id: PACKAGE_ID }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(body.readiness).toEqual(readiness)
    expect(JSON.stringify(body)).not.toContain('packageProfit')
    expect(JSON.stringify(body)).not.toContain('amountGbp')
    expect(mocks.rpc).toHaveBeenCalledWith('commission_package_readiness_2026083004', {
      p_package_id: PACKAGE_ID,
    })
  })

  it('fails closed when the database capability is not installed', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { ready: true, version: 2026090201, mode: 'shadow' },
      error: null,
    })

    const response = await GET(request() as never, {
      params: Promise.resolve({ id: PACKAGE_ID }),
    })

    expect(response.status).toBe(503)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
