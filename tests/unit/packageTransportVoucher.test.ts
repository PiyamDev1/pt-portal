import { describe, expect, it } from 'vitest'
import type { TravelPackageFolder } from '@/app/types/packages'
import {
  normalizeTransportVoucherData,
  renderTransportVoucherHtml,
} from '@/lib/packageTransportVoucher'

describe('transport vouchers', () => {
  it('normalizes route rows and customer-safe fields', () => {
    const voucher = normalizeTransportVoucherData({
      arrivalAirport: ' JED ',
      routes: [' Airport to hotel ', '', 'Hotel to airport'],
    })
    expect(voucher.arrivalAirport).toBe('JED')
    expect(voucher.routes).toEqual(['Airport to hotel', 'Hotel to airport'])
  })

  it('escapes public content and never renders internal notes', () => {
    const html = renderTransportVoucherHtml(
      {
        package_reference: 'PT-ABC123',
        customer_name: 'A & B',
        passenger_summary: { totalPassengers: 4 },
      } as TravelPackageFolder,
      normalizeTransportVoucherData({
        routes: ['<script>alert(1)</script>'],
        publicNotes: 'Call <driver>',
        internalNotes: 'Supplier cost is 100',
      }),
    )
    expect(html).toContain('A &amp; B')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('Supplier cost is 100')
  })
})
