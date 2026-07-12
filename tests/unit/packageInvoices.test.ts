import { describe, expect, it } from 'vitest'
import type { TravelPackageReservation } from '@/app/types/packages'
import {
  calculatePackageInvoiceTotals,
  createPackageInvoiceLinesFromReservations,
  createPackageInvoiceNumber,
  normalizePackageInvoiceLineType,
} from '@/lib/packageInvoices'

describe('package invoice helpers', () => {
  it('creates invoice numbers scoped to the package reference', () => {
    expect(createPackageInvoiceNumber('PT-ABC123')).toMatch(/^INV-PT-ABC123-[A-Z0-9]{4}$/)
  })

  it('normalizes invoice line types', () => {
    expect(normalizePackageInvoiceLineType('flight')).toBe('flight')
    expect(normalizePackageInvoiceLineType('invalid', 'hotel')).toBe('hotel')
  })

  it('calculates invoice totals including discounts and expected commission', () => {
    const totals = calculatePackageInvoiceTotals(
      [
        {
          total_sold_price: 1200,
          discount_amount: 50,
          total_booked_cost: 900,
          expected_commission: 30,
          received_commission: 10,
        },
      ],
      300,
    )

    expect(totals.subtotalSold).toBe(1200)
    expect(totals.totalSold).toBe(1150)
    expect(totals.balanceDue).toBe(850)
    expect(totals.projectedMargin).toBe(280)
    expect(totals.receivedCommissionTotal).toBe(10)
  })

  it('creates invoice lines from reservation items when present', () => {
    const reservation = {
      id: 'reservation-1',
      package_id: 'package-1',
      reservation_type: 'hotel',
      title: 'Swissotel Makkah',
      booked_cost_total: 1000,
      sold_price_total: 1300,
      discount_total: 0,
      commission_expected_total: 100,
      commission_received_total: 0,
      supplier_name: 'Hotel Supplier',
      supplier_reference: 'SUP123',
      currency: 'GBP',
      items: [
        {
          id: 'item-1',
          reservation_id: 'reservation-1',
          package_id: 'package-1',
          item_type: 'hotel',
          title: 'Kaaba view room',
          quantity: 2,
          unit_booked_cost: 400,
          unit_sold_price: 550,
          total_booked_cost: 800,
          total_sold_price: 1100,
          discount_amount: 25,
          commission_expected_amount: 80,
          commission_received_amount: 0,
          supplier_reference: 'ROOM1',
        },
      ],
    } as TravelPackageReservation

    const lines = createPackageInvoiceLinesFromReservations([reservation])

    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      reservation_id: 'reservation-1',
      reservation_item_id: 'item-1',
      line_type: 'hotel',
      description: 'Kaaba view room',
      total_sold_price: 1100,
      expected_commission: 80,
    })
  })
})
