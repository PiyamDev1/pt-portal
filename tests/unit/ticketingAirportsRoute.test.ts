import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ACTOR_ID = '40000000-0000-4000-8000-000000000001'

const mocks = vi.hoisted(() => {
  const requireTicketingAccess = vi.fn()
  const enforceRateLimit = vi.fn()
  const state: {
    capability: { data: unknown; error: unknown }
    airports: { data: unknown; error: unknown }
  } = {
    capability: { data: null, error: null },
    airports: { data: null, error: null },
  }
  const airportQuery: Record<string, ReturnType<typeof vi.fn>> & {
    then?: PromiseLike<{ data: unknown; error: unknown }>['then']
  } = {}
  for (const method of ['select', 'eq', 'in', 'or', 'order', 'limit']) {
    airportQuery[method] = vi.fn(() => airportQuery)
  }
  airportQuery.then = (onFulfilled, onRejected) =>
    Promise.resolve(state.airports).then(onFulfilled, onRejected)
  const from = vi.fn((table: string) => {
    if (table === 'ticket_airports') return airportQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn(async (name: string) => {
    if (name === 'ticketing_schema_status') return state.capability
    throw new Error(`Unexpected RPC: ${name}`)
  })
  const getServiceSupabaseClient = vi.fn(() => ({ from, rpc }))
  return {
    requireTicketingAccess,
    enforceRateLimit,
    state,
    airportQuery,
    from,
    rpc,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/ticketing/apiAuth', () => ({
  requireTicketingAccess: mocks.requireTicketingAccess,
}))
vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))
vi.mock('@/lib/security/rateLimit', () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  getClientIp: () => '127.0.0.1',
}))

import { GET } from '@/app/api/ticketing/airports/route'

function request(query = '') {
  return new NextRequest(`http://localhost/api/ticketing/airports${query ? `?${query}` : ''}`)
}

describe('GET /api/ticketing/airports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireTicketingAccess.mockResolvedValue({
      authorized: true,
      scope: 'own',
      user: { id: ACTOR_ID, email: 'agent@example.test' },
      employee: {
        id: ACTOR_ID,
        email: 'agent@example.test',
        fullName: 'Ticketing Agent',
        role: 'Ticketing Agent',
        departments: ['Ticketing'],
      },
    })
    mocks.enforceRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 179,
      retryAfterSeconds: 0,
    })
    mocks.state.capability = {
      data: [{ ready: true, version: '2026082602' }],
      error: null,
    }
    mocks.state.airports = {
      data: [
        {
          iata_code: 'IST',
          name: 'Istanbul Airport',
          city: 'Istanbul',
          country_code: 'TR',
          timezone: 'Europe/Istanbul',
          is_active: true,
        },
        {
          iata_code: 'LHR',
          name: 'Heathrow Airport',
          city: 'London',
          country_code: 'GB',
          timezone: 'Europe/London',
          is_active: true,
        },
      ],
      error: null,
    }
  })

  it('authenticates before rate limiting or creating a service-role client', async () => {
    mocks.requireTicketingAccess.mockResolvedValueOnce({
      authorized: false,
      response: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await GET(request())

    expect(response.status).toBe(401)
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns only bounded, active, presentation-safe airport fields', async () => {
    const response = await GET(request())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.airportQuery.select).toHaveBeenCalledWith(
      'iata_code, name, city, country_code, timezone, is_active',
    )
    expect(mocks.airportQuery.eq).toHaveBeenCalledWith('is_active', true)
    expect(mocks.airportQuery.order).toHaveBeenCalledWith('iata_code', { ascending: true })
    expect(mocks.airportQuery.limit).toHaveBeenCalledWith(50)
    expect(body).toEqual({
      items: [
        {
          iataCode: 'IST',
          name: 'Istanbul Airport',
          city: 'Istanbul',
          countryCode: 'TR',
          timezone: 'Europe/Istanbul',
        },
        {
          iataCode: 'LHR',
          name: 'Heathrow Airport',
          city: 'London',
          countryCode: 'GB',
          timezone: 'Europe/London',
        },
      ],
    })
  })

  it('supports a sanitized bounded autocomplete search', async () => {
    const response = await GET(request('q=istanbul&limit=12'))

    expect(response.status).toBe(200)
    expect(mocks.airportQuery.or).toHaveBeenCalledWith(
      'iata_code.ilike.ISTANBUL%,name.ilike.%istanbul%,city.ilike.%istanbul%',
    )
    expect(mocks.airportQuery.limit).toHaveBeenCalledWith(12)
  })

  it('resolves existing itinerary airport codes in one bounded database query', async () => {
    const response = await GET(request('codes=lhr,isb,lhr&limit=2'))

    expect(response.status).toBe(200)
    expect(mocks.airportQuery.in).toHaveBeenCalledWith('iata_code', ['LHR', 'ISB'])
    expect(mocks.airportQuery.or).not.toHaveBeenCalled()
    expect(mocks.airportQuery.limit).toHaveBeenCalledWith(2)
  })

  it('rejects unknown, duplicate, malformed, and oversized query values before database work', async () => {
    for (const query of [
      'owner=staff',
      'q=LHR&q=IST',
      'codes=LHR&codes=ISB',
      'q=LHR&codes=ISB',
      'codes=LHR,INVALID',
      'limit=1&limit=2',
      'q=%25%2Cis_active.eq.false',
      'limit=0',
      'limit=101',
    ]) {
      expect((await GET(request(query))).status, query).toBe(400)
    }
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled()
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })

  it('fails closed on a stale, malformed, or unavailable capability', async () => {
    for (const capability of [
      { data: { ready: true, version: 2026082601 }, error: null },
      { data: [], error: null },
      { data: null, error: { code: 'PGRST202', message: 'private details' } },
    ]) {
      mocks.state.capability = capability
      const response = await GET(request())
      expect(response.status).toBe(503)
    }
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('fails closed rather than returning a malformed directory row', async () => {
    mocks.state.airports = {
      data: [
        {
          iata_code: 'LHR',
          name: 'Heathrow Airport',
          city: 'London',
          country_code: 'GB',
          timezone: '',
          is_active: true,
        },
      ],
      error: null,
    }

    expect((await GET(request())).status).toBe(500)
  })

  it('enforces an actor/IP autocomplete rate before database reads', async () => {
    mocks.enforceRateLimit.mockResolvedValueOnce({
      allowed: false,
      response: Response.json({ error: 'Too many requests' }, { status: 429 }),
    })

    const response = await GET(request('q=LHR'))

    expect(response.status).toBe(429)
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith(
      expect.any(NextRequest),
      expect.objectContaining({
        scope: 'ticketing.airport-directory',
        limit: 180,
        windowSeconds: 900,
        identities: [`user:${ACTOR_ID}`, 'ip:127.0.0.1'],
      }),
    )
    expect(mocks.getServiceSupabaseClient).not.toHaveBeenCalled()
  })
})
