import { describe, expect, it } from 'vitest'
import {
  ticketingAppendServiceTransactionSchema,
  ticketingMarkServiceTransactionPaidSchema,
} from '@/lib/ticketing/serviceTransactionContracts'

function validEntry() {
  return {
    expectedBookingVersion: 4,
    expectedRootTransactionVersion: 7,
    serviceType: 'DC' as const,
    bookingDate: '2026-08-23',
    issuedAt: '2026-08-23',
    paymentStatus: 'unpaid' as const,
    paidAt: null,
    currency: 'GBP' as const,
    fares: [
      {
        passengerType: 'ADT' as const,
        quantity: 2,
        unitSupplierCost: 10,
        unitSalePrice: 30,
      },
    ],
  }
}

describe('ticketingAppendServiceTransactionSchema', () => {
  it('accepts a strict issued DC aggregate with explicit optimistic versions', () => {
    expect(ticketingAppendServiceTransactionSchema.parse(validEntry())).toEqual(validEntry())
  })

  it('accepts a paid R-ER only with its branch-local paid date', () => {
    const entry = {
      ...validEntry(),
      serviceType: 'R-ER',
      paymentStatus: 'paid',
      paidAt: '2026-08-23',
    }
    expect(ticketingAppendServiceTransactionSchema.parse(entry)).toEqual(entry)
  })

  it('rejects missing or contradictory payment dates', () => {
    expect(
      ticketingAppendServiceTransactionSchema.safeParse({
        ...validEntry(),
        paymentStatus: 'paid',
      }).success,
    ).toBe(false)
    expect(
      ticketingAppendServiceTransactionSchema.safeParse({
        ...validEntry(),
        paidAt: '2026-08-23',
      }).success,
    ).toBe(false)
  })

  it('rejects pre-booking issue dates, duplicate groups, and excessive totals', () => {
    expect(
      ticketingAppendServiceTransactionSchema.safeParse({
        ...validEntry(),
        issuedAt: '2026-08-22',
      }).success,
    ).toBe(false)
    expect(
      ticketingAppendServiceTransactionSchema.safeParse({
        ...validEntry(),
        fares: [...validEntry().fares, ...validEntry().fares],
      }).success,
    ).toBe(false)
    expect(
      ticketingAppendServiceTransactionSchema.safeParse({
        ...validEntry(),
        fares: [
          { ...validEntry().fares[0], quantity: 99 },
          {
            passengerType: 'CHD',
            quantity: 1,
            unitSupplierCost: 5,
            unitSalePrice: 15,
          },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects unknown identity, status, and pricing fields', () => {
    expect(
      ticketingAppendServiceTransactionSchema.safeParse({
        ...validEntry(),
        ownerEmployeeId: '40000000-0000-4000-8000-000000000099',
      }).success,
    ).toBe(false)
    expect(
      ticketingAppendServiceTransactionSchema.safeParse({
        ...validEntry(),
        operationalStatus: 'held',
      }).success,
    ).toBe(false)
    expect(
      ticketingAppendServiceTransactionSchema.safeParse({
        ...validEntry(),
        commission: 5,
      }).success,
    ).toBe(false)
  })
})

describe('ticketingMarkServiceTransactionPaidSchema', () => {
  it('accepts only optimistic versions and a valid branch-local paid date', () => {
    const payment = {
      expectedBookingVersion: 5,
      expectedTransactionVersion: 2,
      paidAt: '2026-08-23',
    }
    expect(ticketingMarkServiceTransactionPaidSchema.parse(payment)).toEqual(payment)
    expect(
      ticketingMarkServiceTransactionPaidSchema.safeParse({
        ...payment,
        transactionId: '82000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(false)
    expect(
      ticketingMarkServiceTransactionPaidSchema.safeParse({
        ...payment,
        paidAt: '2026-02-30',
      }).success,
    ).toBe(false)
  })
})
