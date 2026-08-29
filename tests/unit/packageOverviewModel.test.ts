import { describe, expect, it } from 'vitest'
import type {
  PackageCombination,
  PackageComponentOption,
  TravelPackageReservation,
} from '@/app/types/packages'
import {
  filterAndSortReservations,
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
})
