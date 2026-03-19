import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const countriesOrder = vi.fn()
  const typesOrder = vi.fn()
  const countriesFrom = vi.fn(() => ({ select: vi.fn(() => ({ order: countriesOrder })) }))
  const typesFrom = vi.fn(() => ({ select: vi.fn(() => ({ order: typesOrder })) }))

  let callCount = 0
  const from = vi.fn((table: string) => {
    if (table === 'visa_countries') return countriesFrom()
    if (table === 'visa_types') return typesFrom()
    return {}
  })
  const createClient = vi.fn(() => ({ from }))
  return { countriesOrder, typesOrder, from, createClient, callCount }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { GET } from '@/app/api/visas/metadata/route'

describe('GET /api/visas/metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockImplementation((table: string) => {
      const order = table === 'visa_countries' ? mocks.countriesOrder : mocks.typesOrder
      return { select: vi.fn(() => ({ order })) }
    })
  })

  it('returns countries and types on success', async () => {
    mocks.countriesOrder.mockResolvedValue({ data: [{ id: 'c-1', name: 'Pakistan' }], error: null })
    mocks.typesOrder.mockResolvedValue({ data: [{ id: 't-1', name: 'Tourist' }], error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.countries).toHaveLength(1)
    expect(body.types).toHaveLength(1)
    expect(body.countries[0].name).toBe('Pakistan')
  })

  it('returns empty arrays when tables have no data', async () => {
    mocks.countriesOrder.mockResolvedValue({ data: null, error: null })
    mocks.typesOrder.mockResolvedValue({ data: null, error: null })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.countries).toEqual([])
    expect(body.types).toEqual([])
  })

  it('returns 500 when a Supabase query throws', async () => {
    mocks.createClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          order: vi.fn(() => {
            throw new Error('connection failed')
          }),
        })),
      })),
    })
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
