import { describe, expect, it } from 'vitest'
import type {
  PackageQuotePayload,
  TravelPackageFolder,
  TravelPackageReservation,
} from '@/app/types/packages'
import { calculateTravelPackageDiscountAllocations } from '@/lib/packageDiscountAllocations'

function reservation(
  id: string,
  reservationType: TravelPackageReservation['reservation_type'],
  sold: number,
  booked: number,
  commission = 0,
  metadata: Record<string, unknown> = {},
): TravelPackageReservation {
  return {
    id,
    package_id: 'package-1',
    quote_id: 'quote-1',
    created_by: 'employee-1',
    updated_by: 'employee-1',
    reservation_type: reservationType,
    title: id,
    status: 'reservation_pending',
    supplier_name: null,
    supplier_reference: null,
    booking_reference: null,
    currency: 'GBP',
    booked_cost_total: booked,
    sold_price_total: sold,
    discount_total: 0,
    commission_expected_total: commission,
    commission_received_total: 0,
    supplier_refund_total: 0,
    customer_refund_total: 0,
    last_refund_reason: null,
    last_refunded_at: null,
    deposit_required: false,
    deposit_amount: 0,
    deposit_due_at: null,
    payment_due_at: null,
    reserved_at: null,
    confirmed_at: null,
    cancelled_at: null,
    customer_visible: false,
    public_notes: null,
    internal_notes: null,
    metadata,
    created_at: '2026-08-11T00:00:00.000Z',
    updated_at: null,
  }
}

const payload: PackageQuotePayload = {
  title: 'Discount allocation',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  adults: 1,
  childrenPaying: 0,
  childrenFree: 0,
  infants: 0,
  itineraryOrder: [],
  departureDate: '',
  returnDate: '',
  stayGroups: [],
  flightOptions: [],
  linkedFlightGroups: [],
  visaOptions: [
    {
      id: 'visa-1',
      title: 'Visa',
      summary: '',
      price: 145,
      pricingMode: 'per_person',
      quantity: 1,
      visaPassengerCategory: 'adult',
    },
  ],
  transportOptions: [],
  limitedTimeOffers: [],
  cardProcessingFeePercent: 0,
  notes: '',
}

describe('travel package discount allocations', () => {
  it('allocates Early Bird then Further Discount by profit and targets Visa Special directly', () => {
    const offers = [
      {
        id: 'early',
        title: 'Early Bird',
        summary: '',
        expiresAt: '',
        discountAmount: 100,
        discountMode: 'total' as const,
        discountType: 'early_bird' as const,
        eligibleServices: ['flight', 'hotel', 'transport'] as const,
        active: true,
      },
      {
        id: 'further',
        title: 'Further Discount',
        summary: '',
        expiresAt: '',
        discountAmount: 90,
        discountMode: 'total' as const,
        discountType: 'general_discount' as const,
        eligibleServices: ['flight', 'hotel', 'transport'] as const,
        active: true,
      },
      {
        id: 'visa-special',
        title: 'Visa Special Discount',
        summary: '',
        expiresAt: '',
        discountAmount: 45,
        discountMode: 'total' as const,
        discountType: 'visa_special' as const,
        eligibleServices: ['visa'] as const,
        visaOptionId: 'visa-1',
        visaPassengerCategory: 'adult' as const,
        visaQuantity: 1,
        active: true,
      },
    ]
    const reservations = [
      reservation('flight', 'flight', 800, 500),
      reservation('hotel', 'hotel', 1000, 500, 100),
      reservation('transport', 'transport', 300, 200),
      reservation('visa', 'visa', 145, 30, 0, {
        optionId: 'visa-1',
        visaPassengerCategory: 'adult',
      }),
    ]
    const snapshot = {
      payload: { ...payload, limitedTimeOffers: offers.map((offer) => ({ ...offer })) },
      selection: {
        combination: {
          appliedOffers: offers.map((offer) => ({ ...offer })),
          offerDiscountTotal: 235,
        },
      },
    } as TravelPackageFolder['selected_quote_snapshot']

    const allocations = calculateTravelPackageDiscountAllocations(reservations, snapshot)

    expect(allocations.flight).toMatchObject({
      earlyBirdTotal: 30,
      generalDiscountTotal: 27,
      total: 57,
    })
    expect(allocations.hotel).toMatchObject({
      earlyBirdTotal: 60,
      generalDiscountTotal: 54,
      total: 114,
    })
    expect(allocations.transport).toMatchObject({
      earlyBirdTotal: 10,
      generalDiscountTotal: 9,
      total: 19,
    })
    expect(allocations.visa).toMatchObject({ visaSpecialTotal: 45, total: 45 })
    expect(
      Object.values(allocations).reduce((total, allocation) => total + allocation.total, 0),
    ).toBe(235)
  })

  it('does not allocate to a zero-profit service while eligible profit remains elsewhere', () => {
    const offer = {
      id: 'further',
      title: 'Further Discount',
      summary: '',
      expiresAt: '',
      discountAmount: 50,
      discountMode: 'total' as const,
      discountType: 'general_discount' as const,
      eligibleServices: ['flight', 'hotel'] as const,
      active: true,
    }
    const reservations = [
      reservation('flight', 'flight', 500, 400),
      reservation('hotel', 'hotel', 1000, 1000),
    ]
    const snapshot = {
      payload: { ...payload, limitedTimeOffers: [{ ...offer }] },
      selection: {
        combination: { appliedOffers: [{ ...offer }], offerDiscountTotal: 50 },
      },
    } as TravelPackageFolder['selected_quote_snapshot']

    const allocations = calculateTravelPackageDiscountAllocations(reservations, snapshot)

    expect(allocations.flight.total).toBe(50)
    expect(allocations.hotel.total).toBe(0)
  })
})
