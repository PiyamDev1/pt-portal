import { describe, expect, it } from 'vitest'
import type { TravelPackageFolder } from '@/app/types/packages'
import {
  getPackageDocumentPortalUrl,
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

  it('keeps portal credentials out of the QR URL', () => {
    expect(getPackageDocumentPortalUrl('token-123', 'https://bookings.piyamtravel.com')).toBe(
      'https://bookings.piyamtravel.com/package-documents/token-123',
    )
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

  it('shows transport provider while keeping route pricing supplier off the customer voucher', () => {
    const html = renderTransportVoucherHtml(
      {
        package_reference: 'PT-ABC123',
        customer_name: 'Customer',
        customer_access_last_name: 'customer',
        passenger_summary: { totalPassengers: 4 },
      } as TravelPackageFolder,
      normalizeTransportVoucherData({
        providerName: 'Operations Company',
        transportCompany: 'Fallback Company',
        providerContact: '+966000000',
        driverContact: '+966111111',
        routeAssignments: [
          {
            routeName: 'Jeddah Airport to Makkah Hotel',
            type: 'Airport Pickup',
            supplierName: 'Hidden Pricing Supplier',
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
    expect(html).toContain('AIR')
    expect(html).toContain('Transport provider: Operations Company')
    expect(html).toContain('Provider contact: +966000000')
    expect(html).toContain('Driver: +966111111')
    expect(html).toContain('brand-logo')
    expect(html).toContain('src="/logo.png"')
    expect(html).not.toContain('Portal login')
    expect(html).not.toContain('Last name:')
    expect(html).toContain('summary-grid')
    expect(html).not.toContain('Fallback Company')
    expect(html).not.toContain('Hidden Pricing Supplier')
  })

  it('can render a self-contained logo for stored HTML documents', () => {
    const html = renderTransportVoucherHtml(
      {
        package_reference: 'PT-ABC123',
        customer_name: 'Customer',
        passenger_summary: { totalPassengers: 2 },
      } as TravelPackageFolder,
      normalizeTransportVoucherData({ routes: ['Airport to hotel'] }),
      { logoSrc: 'data:image/png;base64,logo-data' },
    )

    expect(html).toContain('src="data:image/png;base64,logo-data"')
    expect(html).not.toContain('src="/logo.png"')
  })

  it('renders portrait DL print dimensions', () => {
    const html = renderTransportVoucherHtml(
      {
        package_reference: 'PT-ABC123',
        customer_name: 'Customer',
        passenger_summary: { totalPassengers: 2 },
      } as TravelPackageFolder,
      normalizeTransportVoucherData({ routes: ['Airport to hotel'] }),
    )

    expect(html).toMatch(/@page\s*{\s*size:\s*110mm 220mm;\s*margin:\s*0;\s*}/)
    expect(html).toMatch(/html,\s*body\s*{[^}]*width:\s*110mm;[^}]*height:\s*220mm/s)
    expect(html).toMatch(/\.voucher\s*{[^}]*width:\s*107\.8mm;[^}]*height:\s*215\.6mm/s)
    expect(html).toMatch(/\.timeline-row span\s*{[^}]*font-size:\s*13px/s)
    expect(html).toMatch(/\.timeline-row strong\s*{[^}]*font-size:\s*11\.2px/s)
    expect(html).toMatch(/\.route\s*{[^}]*font-size:\s*11px/s)
    expect(html).toMatch(/\.segment-meta\s*{[^}]*font-size:\s*9\.5px/s)
    expect(html).toMatch(/\.qr\s*{[^}]*width:\s*30mm;[^}]*height:\s*30mm/s)
    expect(html).not.toMatch(/@page\s*{\s*size:\s*220mm 110mm/)
  })
})
