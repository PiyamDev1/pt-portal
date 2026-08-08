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

  it('keeps supplier and provider names off the customer voucher', () => {
    const html = renderTransportVoucherHtml(
      {
        package_reference: 'PT-ABC123',
        customer_name: 'Customer',
        passenger_summary: { totalPassengers: 4 },
      } as TravelPackageFolder,
      normalizeTransportVoucherData({
        providerName: 'Supplier One',
        transportCompany: 'Supplier Two',
        providerContact: '+966000000',
        routeAssignments: [
          {
            routeName: 'Jeddah Airport to Makkah Hotel',
            type: 'Airport Pickup',
            supplierName: 'Private Supplier',
            vehicleType: 'H1',
            date: '2026-08-10',
            time: '10:00',
          },
        ],
        itinerary: [
          {
            type: 'Airport Pickup',
            description: 'Jeddah Airport to Makkah Hotel',
            date: '2026-08-10',
            time: '10:00',
          },
        ],
      }),
    )

    expect(html).toContain('timeline-item')
    expect(html).toContain('Vehicle: H1')
    expect(html).not.toContain('Supplier One')
    expect(html).not.toContain('Supplier Two')
    expect(html).not.toContain('Private Supplier')
    expect(html).not.toContain('Provider:')
    expect(html).not.toContain('Transport Provider')
  })
})
