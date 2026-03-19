import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const order2 = vi.fn()
  const order1 = vi.fn(() => ({ order: order2 }))
  const eqActive = vi.fn(() => ({ order: order1 }))
  const select = vi.fn(() => ({ eq: eqActive }))
  const from = vi.fn(() => ({ select }))
  const createClient = vi.fn(() => ({ from }))
  return { order2, order1, eqActive, select, from, createClient }
})

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))

import { GET } from '@/app/api/nadra/metadata/route'

describe('GET /api/nadra/metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key'
    mocks.createClient.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ select: mocks.select })
    mocks.select.mockReturnValue({ eq: mocks.eqActive })
    mocks.eqActive.mockReturnValue({ order: mocks.order1 })
    mocks.order1.mockReturnValue({ order: mocks.order2 })
  })

  it('returns 500 when Supabase throws', async () => {
    mocks.order2.mockRejectedValue(new Error('db error'))
    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('returns serviceTypes, serviceOptions and pricing on success', async () => {
    mocks.order2.mockResolvedValue({
      data: [
        {
          id: 'p-1',
          service_type: 'NICOP',
          service_option: 'Urgent',
          cost_price: 50,
          sale_price: 80,
        },
        {
          id: 'p-2',
          service_type: 'NICOP',
          service_option: 'Normal',
          cost_price: 30,
          sale_price: 50,
        },
        {
          id: 'p-3',
          service_type: 'PASSPORT',
          service_option: 'Standard',
          cost_price: 70,
          sale_price: 100,
        },
      ],
      error: null,
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.serviceTypes).toHaveLength(2)
    expect(body.serviceTypes.map((t: { id: string }) => t.id)).toContain('NICOP')
    expect(body.serviceOptions).toHaveLength(3)
    expect(body.pricing).toHaveLength(3)
    expect(body.pricing[0].cost).toBe(50)
  })

  it('removes duplicate type+option combinations from serviceOptions', async () => {
    mocks.order2.mockResolvedValue({
      data: [
        {
          id: 'p-1',
          service_type: 'NICOP',
          service_option: 'Urgent',
          cost_price: 50,
          sale_price: 80,
        },
        {
          id: 'p-2',
          service_type: 'NICOP',
          service_option: 'Urgent',
          cost_price: 50,
          sale_price: 80,
        },
      ],
      error: null,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.serviceOptions).toHaveLength(1)
  })
})
