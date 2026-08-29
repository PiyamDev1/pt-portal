import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const voucherSingle = vi.fn()
  const packageSingle = vi.fn()
  const getTransportVoucherLogoDataUrl = vi.fn()

  const from = vi.fn((table: string) => {
    const single = table === 'travel_package_transport_vouchers' ? voucherSingle : packageSingle
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single,
    }
    return query
  })

  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return {
    getUser,
    voucherSingle,
    packageSingle,
    getTransportVoucherLogoDataUrl,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

vi.mock('@/lib/packageTransportVoucherServer', () => ({
  getTransportVoucherLogoDataUrl: mocks.getTransportVoucherLogoDataUrl,
}))

import { GET } from '@/app/api/travel-packages/[id]/transport-vouchers/[voucherId]/preview/route'

describe('transport voucher saved preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.getTransportVoucherLogoDataUrl.mockResolvedValue('data:image/png;base64,current-logo')
    mocks.voucherSingle.mockResolvedValue({
      data: {
        rendered_html: '<!doctype html><html>stale-layout</html>',
        version: 3,
        voucher_data: {
          itinerary: Array.from({ length: 4 }, (_, index) => ({
            type: `Transfer ${index + 1}`,
            description: `Route ${index + 1}`,
            date: `2026-09-${String(index + 1).padStart(2, '0')}`,
            time: '10:00',
          })),
        },
      },
      error: null,
    })
    mocks.packageSingle.mockResolvedValue({
      data: {
        package_reference: 'PT-DUPLEX',
        customer_name: 'Test Customer',
        customer_access_last_name: 'customer',
        passenger_summary: { totalPassengers: 4 },
      },
      error: null,
    })
  })

  it('re-renders saved vouchers with the current mirrored duplex layout', async () => {
    const response = await GET(
      new Request(
        'http://localhost/api/travel-packages/package-1/transport-vouchers/voucher-1/preview',
      ),
      { params: Promise.resolve({ id: 'package-1', voucherId: 'voucher-1' }) },
    )
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toContain('transport-voucher-v3.html')
    expect(html).not.toContain('stale-layout')
    expect(html).toContain('REVERSE SIDE / ITINERARY')
    expect(html).toMatch(/\.continuation-sheet\s*{[^}]*grid-template-columns:\s*98mm 2mm 107\.8mm/s)
    expect(html).toContain('src="data:image/png;base64,current-logo"')
  })

  it('keeps the current layout when logo embedding is unavailable', async () => {
    mocks.getTransportVoucherLogoDataUrl.mockRejectedValueOnce(new Error('logo unavailable'))

    const response = await GET(new Request('http://localhost/preview'), {
      params: Promise.resolve({ id: 'package-1', voucherId: 'voucher-1' }),
    })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).not.toContain('stale-layout')
    expect(html).toContain('REVERSE SIDE / ITINERARY')
    expect(html).toContain('src="/logo.png"')
  })
})
