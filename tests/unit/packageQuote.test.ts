import { describe, expect, it } from 'vitest'
import {
  buildPackageCombinations,
  buildCustomerPackageOptions,
  createTravelPackageReference,
  formatPackageQuoteForCopy,
  formatPackageCombinationForCopy,
  getDefaultPackageSelection,
  getPackageDepositPaymentSummary,
  getPackagePassengerPriceBreakdown,
  getDefaultPackageExpiry,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
  resolvePackageSelection,
} from '@/lib/packageQuote'
import type { PackageQuotePayload } from '@/app/types/packages'

const payload: PackageQuotePayload = {
  title: 'Family Umrah',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: 'A Khan',
  customerPhone: '',
  customerEmail: '',
  adults: 2,
  childrenPaying: 1,
  childrenFree: 1,
  infants: 0,
  itineraryOrder: ['makkah', 'madinah'],
  departureDate: '',
  returnDate: '',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [
        { id: 'mk-a', title: 'Makkah A', summary: 'Makkah A\n5 nights', price: 400 },
        { id: 'mk-b', title: 'Makkah B', summary: 'Makkah B\n5 nights', price: 350 },
      ],
    },
    {
      id: 'madinah',
      label: 'Madinah',
      options: [
        { id: 'md-a', title: 'Madinah A', summary: 'Madinah A\n4 nights', price: 300 },
        { id: 'md-b', title: 'Madinah B', summary: 'Madinah B\n4 nights', price: 275 },
      ],
    },
  ],
  flightOptions: [
    {
      id: 'flt-a',
      title: 'Direct flights',
      summary: 'Direct flights',
      price: 900,
      pricingMode: 'total',
    },
  ],
  visaOptions: [
    {
      id: 'visa-a',
      title: 'ETA visas',
      summary: '4 x ETA visas',
      price: 50,
      pricingMode: 'per_person',
    },
  ],
  transportOptions: [
    { id: 'tr-a', title: 'Private transfers', summary: 'Private transfers', price: 180 },
  ],
  limitedTimeOffers: [],
  cardProcessingFeePercent: 2.5,
  notes: '',
}

describe('package quote calculator', () => {
  it('creates compact package references with the PT prefix', () => {
    expect(createTravelPackageReference()).toMatch(/^PT-[A-Z0-9]{6}$/)
  })

  it('generates sorted combinations including hotels, flights, and transport', () => {
    const combinations = buildPackageCombinations(payload)

    expect(combinations).toHaveLength(4)
    expect(combinations[0].staySelections.map((stay) => stay.option.id)).toEqual(['mk-b', 'md-b'])
    expect(combinations[0].totalPrice).toBe(1905)
    expect(combinations[0].perPersonPrice).toBeCloseTo(635, 3)
    expect(combinations[0].servicePassengers).toBe(4)
    expect(combinations.at(-1)?.totalPrice).toBe(1980)
  })

  it('generates customer options from lower to higher total cost', () => {
    const options = buildCustomerPackageOptions(payload)

    expect(options.map((option) => option.combination.totalPrice)).toEqual([1905, 1930, 1955, 1980])
    expect(options[0].selection.stayOptionIds).toEqual({ makkah: 'mk-b', madinah: 'md-b' })
  })

  it('formats WhatsApp-friendly copy for an option', () => {
    const [first] = buildPackageCombinations(payload)
    const copy = formatPackageCombinationForCopy(payload, first, 1)

    expect(copy).toContain('*Option 1*')
    expect(copy).toContain('***UMRAH PACKAGE***')
    expect(copy).toContain('***Flights***')
    expect(copy).toContain('****Visa****')
    expect(copy).toContain('*********HOTELS**********')
    expect(copy).toContain('*(Makkah)*')
    expect(copy).toContain('*Total Package Cost: £1,905.00*')
  })

  it('resolves a customer selection and rejects invalid option ids', () => {
    const resolved = resolvePackageSelection(payload, {
      stayOptionIds: { makkah: 'mk-a', madinah: 'md-b' },
      flightOptionId: 'flt-a',
      visaOptionId: 'visa-a',
      transportOptionId: 'tr-a',
    })

    expect(resolved.combination.totalPrice).toBe(1955)
    expect(() =>
      resolvePackageSelection(payload, {
        stayOptionIds: { makkah: 'missing', madinah: 'md-b' },
      }),
    ).toThrow('Select a valid Makkah option')
  })

  it('uses adjusted hotel cost for totals while preserving search cost', () => {
    const normalized = normalizePackageQuotePayload({
      ...payload,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [
            {
              id: 'mk-adjusted',
              title: 'Makkah adjusted',
              summary: 'Makkah adjusted',
              price: 1000,
              searchPrice: 1100,
              adjustedPrice: 900,
            },
          ],
        },
      ],
      flightOptions: [],
      visaOptions: [],
      transportOptions: [],
    })
    const [combination] = buildPackageCombinations(normalized)

    expect(normalized.stayGroups[0].options[0].searchPrice).toBe(1100)
    expect(normalized.stayGroups[0].options[0].adjustedPrice).toBe(900)
    expect(normalized.stayGroups[0].options[0].price).toBe(900)
    expect(combination.totalPrice).toBe(900)
  })

  it('calculates linked flight option differences from actual leg costs', () => {
    const linkedPayload = normalizePackageQuotePayload({
      ...payload,
      adults: 1,
      childrenPaying: 1,
      childrenFree: 0,
      infants: 1,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [{ id: 'mk-only', title: 'Makkah', summary: 'Makkah', price: 1000 }],
        },
      ],
      flightOptions: [{ id: 'flt-a', title: 'Main flight', summary: 'Main flight', price: 0 }],
      linkedFlightGroups: [
        {
          id: 'leg-home',
          baseFlightOptionId: 'flt-a',
          routeLabel: 'Madinah to London',
          defaultOptionId: 'saudia',
          options: [
            {
              id: 'saudia',
              airlineName: 'Saudia',
              summary: 'Included leg',
              adultPrice: 200,
              childPrice: 150,
              infantPrice: 50,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
              isDefault: true,
            },
            {
              id: 'egyptair',
              airlineName: 'EgyptAir',
              summary: 'Alternative leg',
              adultPrice: 260,
              childPrice: 180,
              infantPrice: 70,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
            },
          ],
        },
      ],
      visaOptions: [],
      transportOptions: [],
    })

    const defaultSelection = resolvePackageSelection(linkedPayload, {
      ...getDefaultPackageSelection(linkedPayload),
      linkedFlightOptionIds: { 'leg-home': 'saudia' },
    })
    const alternativeSelection = resolvePackageSelection(linkedPayload, {
      ...getDefaultPackageSelection(linkedPayload),
      linkedFlightOptionIds: { 'leg-home': 'egyptair' },
    })

    expect(defaultSelection.combination.totalPrice).toBe(1000)
    expect(alternativeSelection.combination.totalPrice).toBe(1110)
  })

  it('defaults quote expiry to 72 hours from now', () => {
    const now = Date.now()
    const expiresAt = getDefaultPackageExpiry()
    const diffHours = (new Date(expiresAt).getTime() - now) / (60 * 60 * 1000)

    expect(diffHours).toBeGreaterThan(71.9)
    expect(diffHours).toBeLessThanOrEqual(72)
    expect(isPackageQuoteExpired(expiresAt, now)).toBe(false)
    expect(isPackageQuoteExpired(new Date(now - 1000).toISOString(), now)).toBe(true)
  })

  it('preserves textarea spacing in component summaries', () => {
    const normalized = normalizePackageQuotePayload({
      ...payload,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [
            {
              id: 'mk-space',
              title: 'Makkah spaced',
              summary: 'Line one\n\n  Line two with leading space',
              price: 400,
            },
          ],
        },
        payload.stayGroups[1],
      ],
    })

    expect(normalized.stayGroups[0].options[0].summary).toBe(
      'Line one\n\n  Line two with leading space',
    )
  })

  it('uses generic location stays for holiday quotes and keeps Location 1 first', () => {
    const normalized = normalizePackageQuotePayload({
      packageType: 'holiday',
      itineraryOrder: ['location-2', 'location-1', 'location-3'],
    })

    expect(normalized.packageType).toBe('holiday')
    expect(normalized.stayGroups.map((group) => group.label)).toEqual([
      'Location 1',
      'Location 2',
      'Location 3',
    ])
    expect(normalized.itineraryOrder[0]).toBe('location-1')
  })

  it('preserves linked package group notes without exposing shared transport cost in copy', () => {
    const normalized = normalizePackageQuotePayload({
      ...payload,
      linkedPackageGroup: {
        groupId: 'group-1',
        groupReference: 'PTG-ABC123',
        title: 'Ali / Hussain Umrah',
        visibilityMode: 'linked_notice_only',
        currentFamilyLabel: 'Family Ali',
        linkedFamilies: [
          {
            packageId: 'package-2',
            familyLabel: 'Family Hussain',
            packageReference: 'PT-HUS123',
            customerVisible: true,
          },
        ],
        sharedServices: [
          {
            serviceType: 'transport',
            title: 'Shared transport',
            customerNote: 'Transport is shared with Family Hussain / PT-HUS123.',
            customerVisible: true,
          },
        ],
      },
    })

    const copy = formatPackageQuoteForCopy(normalized, 1, 'https://example.test/packages/token')

    expect(normalized.linkedPackageGroup?.groupReference).toBe('PTG-ABC123')
    expect(copy).toContain('Package URL: https://example.test/packages/token')
    expect(copy).toContain('* Transport is shared with Family Hussain / PT-HUS123.')
    expect(copy).not.toContain('allocated')
    expect(copy).not.toContain('internal')
  })

  it('charges under-5 passengers for per-person services but not hotel payer count', () => {
    const servicePayload: PackageQuotePayload = {
      ...payload,
      adults: 2,
      childrenPaying: 0,
      childrenFree: 1,
      infants: 0,
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [{ id: 'mk-only', title: 'Makkah', summary: 'Makkah', price: 1000 }],
        },
      ],
      flightOptions: [
        {
          id: 'flight-pp',
          title: 'Per person flight',
          summary: 'Per person flight',
          price: 300,
          pricingMode: 'per_person',
        },
      ],
      visaOptions: [
        {
          id: 'visa-pp',
          title: 'Per person visa',
          summary: 'Per person visa',
          price: 50,
          pricingMode: 'per_person',
        },
      ],
      transportOptions: [
        {
          id: 'transport-total',
          title: 'Total transport',
          summary: 'Total transport',
          price: 200,
          pricingMode: 'total',
        },
      ],
    }

    const [combination] = buildPackageCombinations(servicePayload)

    expect(combination.payingGuests).toBe(2)
    expect(combination.servicePassengers).toBe(3)
    expect(combination.totalPrice).toBe(2250)
    expect(combination.perPersonPrice).toBe(1125)
  })

  it('applies active limited-time offers to the final package total', () => {
    const offerPayload: PackageQuotePayload = {
      ...payload,
      limitedTimeOffers: [
        {
          id: 'early-bird',
          title: 'Early bird offer',
          summary: 'Book today and save.',
          expiresAt: '2999-01-01T12:00:00.000Z',
          discountAmount: 120,
          discountMode: 'total',
          active: true,
        },
        {
          id: 'inactive-offer',
          title: 'Inactive offer',
          summary: '',
          expiresAt: '2999-01-01T12:00:00.000Z',
          discountAmount: 999,
          discountMode: 'total',
          active: false,
        },
      ],
    }

    const [combination] = buildPackageCombinations(offerPayload)
    const copy = formatPackageCombinationForCopy(offerPayload, combination, 1)

    expect(combination.grossPrice).toBe(1905)
    expect(combination.offerDiscountTotal).toBe(120)
    expect(combination.totalPrice).toBe(1785)
    expect(combination.appliedOffers.map((offer) => offer.id)).toEqual(['early-bird'])
    expect(copy).toContain('****EARLY BIRD OFFER****')
    expect(copy).toContain('*Discount Applied: -£120.00*')
    expect(copy).toContain('*Total Package Cost: £1,785.00*')
  })

  it('uses preferred flights and tiered adult child infant pricing', () => {
    const tieredPayload: PackageQuotePayload = {
      ...payload,
      childrenFree: 0,
      infants: 1,
      flightOptions: [
        {
          id: 'flight-standard',
          title: 'Standard flights',
          summary: 'Standard flights',
          price: 0,
          pricingMode: 'per_person',
          isDefault: true,
          adultPrice: 600,
          childPrice: 500,
          infantPrice: 120,
        },
        {
          id: 'flight-direct',
          title: 'Direct flights',
          summary: 'Direct flights',
          price: 0,
          pricingMode: 'per_person',
          adultPrice: 700,
          childPrice: 575,
          infantPrice: 150,
        },
      ],
    }

    const selection = getDefaultPackageSelection(tieredPayload)
    const resolved = resolvePackageSelection(tieredPayload, selection)
    const breakdown = getPackagePassengerPriceBreakdown(tieredPayload, resolved.combination)

    expect(selection.flightOptionId).toBe('flight-standard')
    expect(resolved.combination.totalPrice).toBe(2900)
    expect(breakdown.adult).toBeCloseTo(928.33, 2)
    expect(breakdown.child).toBeCloseTo(828.33, 2)
    expect(breakdown.infant).toBe(215)
  })

  it('formats a single WhatsApp quote with defaults and option deltas', () => {
    const tieredPayload: PackageQuotePayload = {
      ...payload,
      title: 'September Umrah Package',
      childrenFree: 0,
      infants: 1,
      flightOptions: [
        {
          id: 'flight-standard',
          title: 'Standard flights',
          summary: 'Standard flights',
          price: 0,
          pricingMode: 'per_person',
          isDefault: true,
          adultPrice: 600,
          childPrice: 500,
          infantPrice: 120,
        },
        {
          id: 'flight-direct',
          title: 'Direct flights',
          summary: 'Direct flights',
          price: 0,
          pricingMode: 'per_person',
          adultPrice: 700,
          childPrice: 575,
          infantPrice: 150,
        },
      ],
    }

    const copy = formatPackageQuoteForCopy(tieredPayload)

    expect(copy).toContain('****September Umrah Package****')
    expect(copy).toContain('****Flight Included****')
    expect(copy).toContain('*Airline:* Standard flights')
    expect(copy).toContain('****Alternative Flights****')
    expect(copy).toContain('*Option 1 - Main Flight*')
    expect(copy).toContain('*Airline:* Direct flights')
    expect(copy).toContain('Difference: +£100.00 p.p.')
    expect(copy).toContain('----------------------------')
    expect(copy).toContain('Adult 12+:')
    expect(copy).toContain('Child 5+:')
    expect(copy).toContain('Infant 0-2:')
    expect(copy).not.toContain('Total Package Cost')
  })

  it('prices multiple visa types by quantity', () => {
    const mixedVisaPayload: PackageQuotePayload = {
      ...payload,
      adults: 5,
      childrenPaying: 1,
      childrenFree: 0,
      infants: 0,
      visaOptions: [
        {
          id: 'gb-eta',
          title: 'GB ETA',
          summary: 'GB ETA visa',
          price: 40,
          pricingMode: 'per_person',
          quantity: 4,
        },
        {
          id: 'multi-entry',
          title: '1 year multiple entry',
          summary: 'Multiple entry visa with insurance',
          price: 120,
          pricingMode: 'per_person',
          quantity: 2,
        },
      ],
    }

    const [combination] = buildPackageCombinations(mixedVisaPayload)
    const copy = formatPackageQuoteForCopy(mixedVisaPayload)

    expect(combination.visaOptions).toHaveLength(2)
    expect(combination.totalPrice).toBe(2105)
    expect(copy).toContain('4 x GB ETA visa')
    expect(copy).toContain('2 x Multiple entry visa with insurance')
  })

  it('adds card processing charges only when card is selected', () => {
    const bankSelection = resolvePackageSelection(payload, {
      ...getDefaultPackageSelection(payload),
      paymentMethod: 'bank_transfer',
    })
    const cardSelection = resolvePackageSelection(payload, {
      ...getDefaultPackageSelection(payload),
      paymentMethod: 'card',
    })

    expect(bankSelection.combination.paymentSurchargeTotal).toBe(0)
    expect(bankSelection.combination.totalPrice).toBe(1980)
    expect(cardSelection.combination.paymentSurchargeTotal).toBe(49.5)
    expect(cardSelection.combination.totalPrice).toBe(2029.5)
  })

  it('keeps deposit-only payment method separate from full package surcharge', () => {
    const depositSelection = resolvePackageSelection(
      {
        ...payload,
        depositRequired: true,
        depositAmount: 2000,
      },
      {
        ...getDefaultPackageSelection(payload),
        paymentIntent: 'deposit_only',
        paymentMethod: 'card',
        depositPaymentMethod: 'card',
      },
    )

    expect(depositSelection.selection.depositPaymentMethod).toBe('card')
    expect(depositSelection.combination.paymentMethod).toBe('bank_transfer')
    expect(depositSelection.combination.paymentSurchargeTotal).toBe(0)
    expect(depositSelection.combination.totalPrice).toBe(1980)
  })

  it('adds the configured Credit Card fee to deposit-only payable totals', () => {
    const depositPayload = {
      ...payload,
      cardProcessingFeePercent: 3,
      depositRequired: true,
      depositAmount: 1000,
    }

    const cardDeposit = getPackageDepositPaymentSummary(depositPayload, 'card')
    const bankDeposit = getPackageDepositPaymentSummary(depositPayload, 'bank_transfer')

    expect(cardDeposit.depositAmount).toBe(1000)
    expect(cardDeposit.processingFee).toBe(30)
    expect(cardDeposit.total).toBe(1030)
    expect(bankDeposit.processingFee).toBe(0)
    expect(bankDeposit.total).toBe(1000)
  })

  it('defaults new package quotes to a 3 percent Credit Card processing fee', () => {
    expect(normalizePackageQuotePayload({}).cardProcessingFeePercent).toBe(3)
  })
})
