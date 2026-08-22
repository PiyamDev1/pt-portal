import { describe, expect, it } from 'vitest'
import {
  ticketingCompleteTkDetailsSchema,
  ticketingDetailsStatus,
} from '@/lib/ticketing/completionContracts'

function validDetails() {
  return {
    expectedBookingVersion: 2,
    expectedTransactionVersion: 3,
    contactPhone: '+44 7700 900123',
    departureDate: '2026-09-01',
    returnDate: '2026-09-10',
    paymentStatus: 'paid' as const,
    paidAt: '2026-08-22',
    fareSales: [
      { passengerType: 'ADT' as const, unitSalePrice: 525.5 },
      { passengerType: 'CHD' as const, unitSalePrice: 410 },
    ],
    passengers: [
      {
        passengerType: 'ADT' as const,
        position: 1,
        fullName: 'Adult Passenger',
        contactPhone: null,
        dateOfBirth: null,
        ticketNumber: null,
      },
      {
        passengerType: 'CHD' as const,
        position: 1,
        fullName: null,
        contactPhone: null,
        dateOfBirth: '2017-03-02',
        ticketNumber: null,
      },
    ],
  }
}

describe('Ticketing completion contracts', () => {
  it('accepts the bounded strict completion payload', () => {
    const parsed = ticketingCompleteTkDetailsSchema.parse(validDetails())

    expect(parsed.contactPhone).toBe('+44 7700 900123')
    expect(parsed.paymentStatus).toBe('paid')
  })

  it('rejects unknown fields at the root and nested levels', () => {
    expect(
      ticketingCompleteTkDetailsSchema.safeParse({ ...validDetails(), ownerEmployeeId: 'spoofed' })
        .success,
    ).toBe(false)
    expect(
      ticketingCompleteTkDetailsSchema.safeParse({
        ...validDetails(),
        passengers: [{ ...validDetails().passengers[0], commission: 10 }],
      }).success,
    ).toBe(false)
  })

  it('enforces payment/date consistency and journey ordering', () => {
    expect(
      ticketingCompleteTkDetailsSchema.safeParse({
        ...validDetails(),
        paymentStatus: 'paid',
        paidAt: null,
      }).success,
    ).toBe(false)
    expect(
      ticketingCompleteTkDetailsSchema.safeParse({
        ...validDetails(),
        paymentStatus: 'unpaid',
        paidAt: '2026-08-22',
      }).success,
    ).toBe(false)
    expect(
      ticketingCompleteTkDetailsSchema.safeParse({
        ...validDetails(),
        returnDate: '2026-08-31',
      }).success,
    ).toBe(false)
    expect(
      ticketingCompleteTkDetailsSchema.safeParse({
        ...validDetails(),
        paidAt: '2026-02-30',
      }).success,
    ).toBe(false)
  })

  it('rejects duplicate fare types and passenger positions', () => {
    expect(
      ticketingCompleteTkDetailsSchema.safeParse({
        ...validDetails(),
        fareSales: [
          { passengerType: 'ADT', unitSalePrice: 500 },
          { passengerType: 'ADT', unitSalePrice: 510 },
        ],
      }).success,
    ).toBe(false)
    expect(
      ticketingCompleteTkDetailsSchema.safeParse({
        ...validDetails(),
        passengers: [validDetails().passengers[0], validDetails().passengers[0]],
      }).success,
    ).toBe(false)
  })

  it('marks details complete only with contact, departure, every sale, and exact named slots', () => {
    const complete = {
      contactPhone: '+44 7700 900123',
      departureDate: '2026-09-01',
      fares: [
        { passengerType: 'ADT' as const, quantity: 2, unitSalePrice: 525 },
        { passengerType: 'INF' as const, quantity: 1, unitSalePrice: 75 },
      ],
      passengers: [
        { passengerType: 'ADT' as const, position: 1, fullName: 'One' },
        { passengerType: 'ADT' as const, position: 2, fullName: 'Two' },
        { passengerType: 'INF' as const, position: 1, fullName: 'Three' },
      ],
    }

    expect(ticketingDetailsStatus(complete)).toBe('complete')
    expect(
      ticketingDetailsStatus({
        ...complete,
        passengers: complete.passengers.slice(0, 2),
      }),
    ).toBe('needs_details')
    expect(
      ticketingDetailsStatus({
        ...complete,
        fares: [{ ...complete.fares[0], unitSalePrice: null }, complete.fares[1]],
      }),
    ).toBe('needs_details')
    expect(ticketingDetailsStatus({ ...complete, contactPhone: null })).toBe('needs_details')
  })
})
