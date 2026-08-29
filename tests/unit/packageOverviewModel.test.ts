import { describe, expect, it } from 'vitest'
import type {
  PackageCombination,
  PackageComponentOption,
  TravelPackageReservation,
} from '@/app/types/packages'
import {
  filterAndSortReservations,
  getReservationCalculationLine,
  getReservationCalculationTotals,
  getSharedTransportReferenceBookedCost,
  getOptionSoldTotal,
  getVisaOptionSoldTotal,
  getVisaPassengerCategoryLabel,
  normalizeSelectedCombination,
  parseMoneyInput,
} from '@/app/dashboard/packages/[id]/packageOverviewModel'

describe('package overview model', () => {
  it('normalizes persisted combinations without changing their selected totals', () => {
    const combination = {
      staySelections: [],
      visaOptions: [],
      appliedOffers: [],
      packageSubtotalPrice: 123,
      paymentSurchargeTotal: 4,
      totalPrice: 127,
      grossPrice: 127,
      offerDiscountTotal: 0,
      perPersonPrice: 63.5,
      payingGuests: 2,
      servicePassengers: 2,
      currency: 'GBP',
      paymentMethod: 'bank_transfer',
    } as PackageCombination

    expect(normalizeSelectedCombination(combination)).toMatchObject({
      totalPrice: 127,
      servicePassengers: 2,
      currency: 'GBP',
    })
  })

  it('preserves per-category visa quantities and passenger pricing', () => {
    const visa = {
      price: 115,
      pricingMode: 'per_person',
      visaPassengerCategory: 'adult',
      quantity: 1,
    } as PackageComponentOption

    expect(
      getVisaOptionSoldTotal(visa, {
        adults: 2,
        childrenPaying: 1,
        childrenFree: 0,
        infants: 0,
        servicePassengers: 3,
      }),
    ).toBe(115)
    expect(getVisaPassengerCategoryLabel(visa.visaPassengerCategory)).toBe('Adult')
  })

  it('supports age-banded option prices and safe money parsing', () => {
    const option = {
      adultPrice: 100,
      childPrice: 50,
      infantPrice: 10,
    } as PackageComponentOption

    expect(
      getOptionSoldTotal(option, 5, {
        adults: 2,
        childrenPaying: 1,
        childrenFree: 1,
        infants: 1,
      }),
    ).toBe(310)
    expect(parseMoneyInput('12.50')).toBe(12.5)
    expect(parseMoneyInput('not-money')).toBe(0)
  })

  it('filters group reservations by family, status, and search before sorting', () => {
    const reservations = [
      {
        id: 'older-hotel',
        quote_id: 'quote-1',
        title: 'Makkah hotel',
        reservation_type: 'hotel',
        status: 'confirmed',
        supplier_name: 'Hotel Supplier',
        sold_price_total: 1200,
        booked_cost_total: 900,
        metadata: { familyLabel: 'Lead family' },
        created_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'newer-flight',
        quote_id: 'quote-2',
        title: 'Return flight',
        reservation_type: 'flight',
        status: 'confirmed',
        supplier_name: 'Airline',
        sold_price_total: 800,
        booked_cost_total: 700,
        metadata: { familyLabel: 'Second family' },
        created_at: '2026-02-01T00:00:00.000Z',
      },
      {
        id: 'shared-transport',
        quote_id: null,
        title: 'Shared group transport',
        reservation_type: 'transport',
        status: 'reservation_pending',
        sold_price_total: 0,
        booked_cost_total: 500,
        metadata: { physicalReservation: true },
        created_at: '2026-03-01T00:00:00.000Z',
      },
    ] as TravelPackageReservation[]

    expect(
      filterAndSortReservations(reservations, {
        quoteId: 'quote-2',
        status: 'confirmed',
        query: 'second family',
        sort: 'newest',
      }).map((reservation) => reservation.id),
    ).toEqual(['newer-flight'])
    expect(
      filterAndSortReservations(reservations, {
        quoteId: 'shared',
        sort: 'booked_high',
      }).map((reservation) => reservation.id),
    ).toEqual(['shared-transport'])
  })

  it('counts one group main transport and treats family transports as invoice references', () => {
    const references = [
      {
        id: 'family-1-transport',
        quote_id: 'quote-1',
        group_member_id: 'member-1',
        reservation_type: 'transport',
        booked_cost_total: 111,
        sold_price_total: 200,
        discount_total: 0,
        commission_expected_total: 0,
        supplier_refund_total: 0,
        customer_refund_total: 0,
        metadata: { sharedGroupTransport: true, billingAllocation: true },
      },
      {
        id: 'family-2-transport',
        quote_id: 'quote-2',
        group_member_id: 'member-2',
        reservation_type: 'transport',
        booked_cost_total: 222,
        sold_price_total: 300,
        discount_total: 0,
        commission_expected_total: 0,
        supplier_refund_total: 0,
        customer_refund_total: 0,
        metadata: { sharedGroupTransport: true, billingAllocation: true },
      },
    ] as TravelPackageReservation[]
    const main = {
      id: 'main-transport',
      quote_id: null,
      reservation_type: 'transport',
      booked_cost_total: 500,
      sold_price_total: 0,
      discount_total: 0,
      commission_expected_total: 0,
      supplier_refund_total: 0,
      customer_refund_total: 0,
      metadata: {
        sharedGroupTransport: true,
        physicalReservation: true,
        soldPriceOverride: false,
        familyAllocations: [
          { quoteId: 'quote-1', groupMemberId: 'member-1', passengerCount: 2 },
          { quoteId: 'quote-2', groupMemberId: 'member-2', passengerCount: 3 },
        ],
      },
    } as TravelPackageReservation
    const reservations = [...references, main]

    expect(getReservationCalculationTotals(reservations)).toMatchObject({
      booked: 500,
      sold: 500,
      calculationRows: 1,
      referenceRows: 2,
    })
    expect(getReservationCalculationLine(references[0], reservations).included).toBe(false)
    expect(getSharedTransportReferenceBookedCost(references[0], reservations)).toBe(200)
    expect(getSharedTransportReferenceBookedCost(references[1], reservations)).toBe(300)
    expect(
      getReservationCalculationTotals([
        ...references,
        { ...main, sold_price_total: 650, metadata: { ...main.metadata, soldPriceOverride: true } },
      ]).sold,
    ).toBe(650)
  })
})
