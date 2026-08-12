import { describe, expect, it } from 'vitest'
import type { PackageCombination, PackageComponentOption } from '@/app/types/packages'
import {
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
})
