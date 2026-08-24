import { describe, expect, it } from 'vitest'
import {
  TICKET_FARE_ADJUSTMENT_MAX_FARE_GBP,
  ticketingAppendFareAdjustmentSchema,
} from '@/lib/ticketing/fareAdjustmentContracts'

const BOOKING_ID = '80000000-0000-4000-8000-000000000001'

function validEntry() {
  return {
    bookingId: BOOKING_ID,
    expectedBookingVersion: 4,
    expectedRootTransactionVersion: 7,
    expectedPreviousAdjustmentId: null,
    newSupplierFareGbp: 450.25,
    effectiveDate: '2026-08-24',
    notes: null,
    currency: 'GBP' as const,
  }
}

describe('ticketing fare-adjustment contracts', () => {
  it('accepts the strict public GBP adjustment contract and trims notes', () => {
    expect(
      ticketingAppendFareAdjustmentSchema.parse({
        ...validEntry(),
        notes: '  Fare confirmed with supplier  ',
      }),
    ).toEqual({ ...validEntry(), notes: 'Fare confirmed with supplier' })

    expect(
      [2.01, 4.02].every(
        (newSupplierFareGbp) =>
          ticketingAppendFareAdjustmentSchema.safeParse({
            ...validEntry(),
            newSupplierFareGbp,
          }).success,
      ),
    ).toBe(true)
  })

  it.each([
    ['zero fare', { newSupplierFareGbp: 0 }],
    ['negative fare', { newSupplierFareGbp: -1 }],
    ['more than two decimals', { newSupplierFareGbp: 450.001 }],
    ['fractional penny regression', { newSupplierFareGbp: 2.011 }],
    ['excessive fare', { newSupplierFareGbp: TICKET_FARE_ADJUSTMENT_MAX_FARE_GBP + 0.01 }],
    ['invalid calendar date', { effectiveDate: '2026-02-30' }],
    ['empty note', { notes: '   ' }],
    ['long note', { notes: 'x'.repeat(1_001) }],
    ['caller actor', { actingEmployeeId: BOOKING_ID }],
    ['caller owner', { ownerEmployeeId: BOOKING_ID }],
    ['non-GBP currency', { currency: 'USD' }],
  ])('rejects %s', (_name, patch) => {
    expect(
      ticketingAppendFareAdjustmentSchema.safeParse({ ...validEntry(), ...patch }).success,
    ).toBe(false)
  })
})
