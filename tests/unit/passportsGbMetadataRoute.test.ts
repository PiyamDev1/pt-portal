import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const agesOrder = vi.fn()
  const pagesOrder = vi.fn()
  const servicesOrder = vi.fn()
  const pricingSelect = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'gb_passport_ages') {
      return { select: vi.fn(() => ({ order: agesOrder })) }
    }
    if (table === 'gb_passport_pages') {
      return { select: vi.fn(() => ({ order: pagesOrder })) }
    }
    if (table === 'gb_passport_services') {
      return { select: vi.fn(() => ({ order: servicesOrder })) }
    }
    if (table === 'gb_passport_pricing') {
      return { select: pricingSelect }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))
  return { agesOrder, pagesOrder, servicesOrder, pricingSelect, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { GET } from '@/app/api/passports/gb/metadata/route'

describe('GET /api/passports/gb/metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  })

  it('returns mapped metadata and flattened pricing', async () => {
    mocks.agesOrder.mockResolvedValue({ data: [{ id: 1, name: 'Adult' }], error: null })
    mocks.pagesOrder.mockResolvedValue({ data: [{ id: 1, option_label: '34 Pages' }], error: null })
    mocks.servicesOrder.mockResolvedValue({ data: [{ id: 1, name: 'Standard' }], error: null })
    mocks.pricingSelect.mockResolvedValue({
      data: [{ id: 'p-1', cost_price: 90, sale_price: 120, age_group: 'Adult', pages: '34', service_type: 'Standard' }],
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ages).toHaveLength(1)
    expect(body.pages).toHaveLength(1)
    expect(body.services).toHaveLength(1)
    expect(body.pricing).toEqual([
      { id: 'p-1', cost: 90, price: 120, age: 'Adult', pages: '34', service: 'Standard' },
    ])
  })

  it('returns 500 when a metadata query throws', async () => {
    mocks.agesOrder.mockRejectedValue(new Error('query failed'))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/query failed/i)
  })
})
