import { describe, expect, it, vi } from 'vitest'
import type { TravelPackagePayment, TravelPackageReservation } from '@/app/types/packages'
import { syncPackagePaymentStatus } from '@/lib/packagePaymentsServer'

function payment(overrides: Partial<TravelPackagePayment>): TravelPackagePayment {
  return {
    id: 'payment-1',
    package_id: 'package-1',
    amount: 0,
    currency: 'GBP',
    payment_type: 'payment',
    payment_method: 'bank_transfer',
    payment_status: 'completed',
    ...overrides,
  } as TravelPackagePayment
}

function reservation(overrides: Partial<TravelPackageReservation>): TravelPackageReservation {
  return {
    id: 'reservation-1',
    package_id: 'package-1',
    reservation_type: 'hotel',
    title: 'Hotel',
    status: 'confirmed',
    currency: 'GBP',
    booked_cost_total: 600,
    sold_price_total: 1000,
    discount_total: 100,
    customer_refund_total: 0,
    supplier_refund_total: 0,
    commission_expected_total: 0,
    ...overrides,
  } as TravelPackageReservation
}

describe('syncPackagePaymentStatus', () => {
  it('uses the reservation balance, marks the package paid, and cancels stale requests', async () => {
    const updates: Array<{ table: string; payload: Record<string, unknown> }> = []
    const supabase = {
      from(table: string) {
        let payload: Record<string, unknown> = {}
        const chain = {
          update(nextPayload: Record<string, unknown>) {
            payload = nextPayload
            updates.push({ table, payload })
            return chain
          },
          eq() {
            if (table === 'travel_packages') return Promise.resolve({ error: null })
            return chain
          },
          in: vi.fn(async () => ({ error: null })),
        }
        return chain
      },
    }

    const result = await syncPackagePaymentStatus(supabase as never, 'package-1', {
      reservations: [reservation({})],
      payments: [
        payment({ id: 'received', amount: 900 }),
        payment({ id: 'request', amount: 100, payment_status: 'pending' }),
      ],
    })

    expect(result.paymentStatus).toBe('paid')
    expect(result.reservationSaleTotal).toBe(900)
    expect(result.outstandingBalance).toBe(0)
    expect(result.autoCancelledPendingPaymentCount).toBe(1)
    expect(updates).toEqual(
      expect.arrayContaining([
        { table: 'travel_package_payments', payload: { payment_status: 'cancelled' } },
        { table: 'travel_package_installments', payload: { status: 'cancelled', paid_at: null } },
        { table: 'travel_packages', payload: { payment_status: 'paid' } },
      ]),
    )
  })

  it('does not count an optional invoice or pending request as received money', async () => {
    const packageUpdates: Record<string, unknown>[] = []
    const supabase = {
      from(table: string) {
        const chain = {
          update(payload: Record<string, unknown>) {
            if (table === 'travel_packages') packageUpdates.push(payload)
            return chain
          },
          eq: vi.fn(async () => ({ error: null })),
        }
        return chain
      },
    }

    const result = await syncPackagePaymentStatus(supabase as never, 'package-1', {
      reservations: [reservation({ sold_price_total: 1200, discount_total: 0 })],
      payments: [
        payment({ amount: 300 }),
        payment({ id: 'request', amount: 900, payment_status: 'pending' }),
      ],
    })

    expect(result.paymentStatus).toBe('partial')
    expect(result.outstandingBalance).toBe(900)
    expect(result.autoCancelledPendingPaymentCount).toBe(0)
    expect(packageUpdates).toEqual([{ payment_status: 'partial' }])
  })
})
