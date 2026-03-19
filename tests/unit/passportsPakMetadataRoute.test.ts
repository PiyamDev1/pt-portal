import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const categoriesOrder = vi.fn()
  const categoriesEq = vi.fn(() => ({ order: categoriesOrder }))

  const speedsOrder = vi.fn()
  const speedsEq = vi.fn(() => ({ order: speedsOrder }))

  const typesOrder = vi.fn()
  const typesEq = vi.fn(() => ({ order: typesOrder }))

  const pagesOrder = vi.fn()
  const pagesEq = vi.fn(() => ({ order: pagesOrder }))

  const pricingEq = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'pk_passport_categories') {
      return { select: vi.fn(() => ({ eq: categoriesEq })) }
    }
    if (table === 'pk_passport_speeds') {
      return { select: vi.fn(() => ({ eq: speedsEq })) }
    }
    if (table === 'pk_passport_application_types') {
      return { select: vi.fn(() => ({ eq: typesEq })) }
    }
    if (table === 'pk_passport_pages') {
      return { select: vi.fn(() => ({ eq: pagesEq })) }
    }
    if (table === 'pk_passport_pricing') {
      return { select: vi.fn(() => ({ eq: pricingEq })) }
    }
    return {}
  })

  const createClient = vi.fn(() => ({ from }))

  return {
    categoriesOrder,
    categoriesEq,
    speedsOrder,
    speedsEq,
    typesOrder,
    typesEq,
    pagesOrder,
    pagesEq,
    pricingEq,
    from,
    createClient,
  }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { GET } from '@/app/api/passports/pak/metadata/route'

describe('GET /api/passports/pak/metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
  })

  it('returns mapped metadata and flattened pricing', async () => {
    mocks.categoriesOrder.mockResolvedValue({ data: [{ name: 'Adult' }], error: null })
    mocks.speedsOrder.mockResolvedValue({ data: [{ name: 'Urgent' }], error: null })
    mocks.typesOrder.mockResolvedValue({ data: [{ name: 'Renewal' }], error: null })
    mocks.pagesOrder.mockResolvedValue({ data: [{ option_label: '36 Pages' }], error: null })
    mocks.pricingEq.mockResolvedValue({
      data: [
        {
          id: 'p-1',
          category: 'Adult',
          speed: 'Urgent',
          application_type: 'Renewal',
          pages: '36 Pages',
          cost_price: 120,
          sale_price: 150,
        },
      ],
      error: null,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.categories).toEqual(['Adult'])
    expect(body.speeds).toEqual(['Urgent'])
    expect(body.applicationTypes).toEqual(['Renewal'])
    expect(body.pageCounts).toEqual(['36 Pages'])
    expect(body.pricing).toEqual([
      {
        id: 'p-1',
        cost: 120,
        price: 150,
        category: 'Adult',
        speed: 'Urgent',
        applicationType: 'Renewal',
        pages: '36 Pages',
      },
    ])
  })

  it('returns 500 when a query throws', async () => {
    mocks.categoriesOrder.mockRejectedValue(new Error('db unavailable'))
    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toMatch(/db unavailable/i)
  })
})
