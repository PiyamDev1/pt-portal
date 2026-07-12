import { describe, expect, it } from 'vitest'
import type { TravelPackageReservation } from '@/app/types/packages'
import {
  calculatePackageInvoiceTotals,
  createCustomerInvoiceSnapshot,
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

  it('creates a customer snapshot without booked cost, margin, commission, or internal notes', () => {
    const snapshot = createCustomerInvoiceSnapshot(
      {
        id: 'invoice-1', package_id: 'package-1', quote_id: 'quote-1', created_by: 'agent-1',
        updated_by: 'agent-1', released_by: null, invoice_number: 'INV-PT-ABC123',
        status: 'draft', currency: 'GBP', subtotal_sold: 1200, discount_total: 100,
        total_sold: 1100, total_paid: 300, balance_due: 800, total_booked_cost: 700,
        projected_margin: 450, expected_commission_total: 50, received_commission_total: 0,
        released_to_customer: false, released_at: null, version: 1,
        customer_terms: 'Terms apply', internal_notes: 'Supplier cost details', metadata: {},
        created_at: '2026-07-01T00:00:00.000Z', updated_at: null, voided_at: null,
      },
      [{
        id: 'line-1', invoice_id: 'invoice-1', package_id: 'package-1', reservation_id: null,
        reservation_item_id: null, line_type: 'hotel', description: 'Hotels', quantity: 1,
        unit_sold_price: 1200, total_sold_price: 1200, unit_booked_cost: 700,
        total_booked_cost: 700, discount_amount: 100, expected_commission: 50,
        received_commission: 0, customer_visible: true, sort_order: 0, metadata: {},
        created_at: '2026-07-01T00:00:00.000Z', updated_at: null,
      }],
    )

    expect(snapshot.lines[0]).toMatchObject({ description: 'Hotels', total_sold_price: 1200 })
    expect(snapshot).not.toHaveProperty('total_booked_cost')
    expect(snapshot).not.toHaveProperty('projected_margin')
    expect(snapshot).not.toHaveProperty('internal_notes')
    expect(snapshot.lines[0]).not.toHaveProperty('unit_booked_cost')
    expect(snapshot.lines[0]).not.toHaveProperty('expected_commission')
  })
})
