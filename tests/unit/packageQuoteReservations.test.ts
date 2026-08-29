import { describe, expect, it } from 'vitest'
import type { PackageCombination, PackageQuotePayload } from '@/app/types/packages'
import {
  buildPackageQuoteReservationDrafts,
  buildSharedGroupTransportDraft,
} from '@/lib/packageQuoteReservations'
import { resolvePackageSelection } from '@/lib/packageQuote'

function makePayload(overrides: Partial<PackageQuotePayload> = {}): PackageQuotePayload {
  return {
    title: 'Quote ABC123',
    packageType: 'umrah',
    currency: 'GBP',
    customerName: 'Test Family',
    customerPhone: '',
    customerEmail: '',
    adults: 2,
    childrenPaying: 1,
    childrenFree: 1,
    infants: 1,
    itineraryOrder: ['makkah'],
    departureDate: '2026-10-01',
    returnDate: '2026-10-10',
    stayGroups: [],
    flightOptions: [],
    linkedFlightGroups: [],
    visaOptions: [],
    transportOptions: [],
    limitedTimeOffers: [],
    cardProcessingFeePercent: 0,
    notes: '',
    ...overrides,
  }
}

function makeCombination(overrides: Partial<PackageCombination> = {}): PackageCombination {
  return {
    id: 'combination-1',
    staySelections: [],
    flightOption: null,
    linkedFlightSelections: [],
    visaOption: null,
    visaOptions: [],
    transportOption: null,
    packageSubtotalPrice: 0,
    paymentMethod: 'bank_transfer',
    paymentBreakdown: null,
    paymentSurchargeTotal: 0,
    totalPrice: 0,
    grossPrice: 0,
    offerDiscountTotal: 0,
    refundAdjustmentTotal: 0,
    perPersonPrice: 0,
    payingGuests: 4,
    servicePassengers: 5,
    currency: 'GBP',
    appliedOffers: [],
    ...overrides,
  }
}

describe('package quote reservation drafts', () => {
  it('keeps main and linked flight values in separate stable reservation rows', () => {
    const payload = makePayload()
    const combination = makeCombination({
      flightOption: {
        id: 'main-flight',
        title: 'Saudi outbound',
        summary: 'London to Jeddah',
        price: 0,
        adultPrice: 100,
        childPrice: 80,
        infantPrice: 20,
      },
      linkedFlightSelections: [
        {
          group: {
            id: 'return-leg',
            routeLabel: 'Madinah to London',
            defaultOptionId: 'linked-flight',
            options: [],
          },
          option: {
            id: 'linked-flight',
            airlineName: 'Wizz Air',
            summary: 'Madinah to London',
            adultPrice: 50,
            childPrice: 40,
            infantPrice: 10,
            adultDelta: 0,
            childDelta: 0,
            infantDelta: 0,
            isDefault: true,
          },
        },
      ],
      totalPrice: 570,
      grossPrice: 570,
      packageSubtotalPrice: 570,
    })

    const drafts = buildPackageQuoteReservationDrafts({ payload, combination })

    expect(drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          syncKey: 'flight-main',
          soldPriceTotal: 380,
        }),
        expect.objectContaining({
          syncKey: 'flight-linked-return-leg',
          soldPriceTotal: 190,
        }),
      ]),
    )
    expect(drafts.filter((draft) => draft.reservationType === 'flight')).toHaveLength(2)
  })

  it('creates family sale allocations and one physical cost row for shared transport', () => {
    const firstPayload = makePayload({ adults: 4, childrenPaying: 0, childrenFree: 0, infants: 0 })
    const secondPayload = makePayload({ adults: 1, childrenPaying: 0, childrenFree: 0, infants: 0 })
    const transport = {
      id: 'shared-transport',
      title: 'Option 1',
      summary: '* Jeddah Airport to Makkah Hotel (Car)',
      price: 100,
      pricingMode: 'per_person' as const,
      transportNetCost: 485,
      transportNetCurrency: 'GBP',
      transportMainSupplierName: 'Operations supplier',
    }
    const firstCombination = makeCombination({
      transportOption: transport,
      totalPrice: 400,
      grossPrice: 400,
      packageSubtotalPrice: 400,
      servicePassengers: 4,
    })
    const secondCombination = makeCombination({
      transportOption: transport,
      totalPrice: 100,
      grossPrice: 100,
      packageSubtotalPrice: 100,
      servicePassengers: 1,
    })

    const firstDraft = buildPackageQuoteReservationDrafts({
      payload: firstPayload,
      combination: firstCombination,
      familyLabel: 'Family 1',
      sharedGroupTransportAllocation: true,
    }).find((draft) => draft.reservationType === 'transport')
    const physicalDraft = buildSharedGroupTransportDraft([
      {
        quoteId: 'quote-1',
        groupMemberId: 'member-1',
        familyLabel: 'Family 1',
        payload: firstPayload,
        combination: firstCombination,
      },
      {
        quoteId: 'quote-2',
        groupMemberId: 'member-2',
        familyLabel: 'Family 2',
        payload: secondPayload,
        combination: secondCombination,
      },
    ])

    expect(firstDraft).toMatchObject({
      syncKey: 'transport-family-allocation',
      soldPriceTotal: 400,
      suggestedBookedCost: 0,
    })
    expect(physicalDraft).toMatchObject({
      syncKey: 'transport-group-physical',
      title: 'Group main transport',
      soldPriceTotal: 500,
      suggestedBookedCost: 0,
      metadata: {
        familyAllocations: [
          expect.objectContaining({
            quoteId: 'quote-1',
            passengerCount: 4,
            bookedCost: 388,
            soldPrice: 400,
          }),
          expect.objectContaining({
            quoteId: 'quote-2',
            passengerCount: 1,
            bookedCost: 97,
            soldPrice: 100,
          }),
        ],
      },
    })
  })

  it('uses the main shared transport for passenger allocations and keeps family choices as references', () => {
    const leadPayload = makePayload({ adults: 4, childrenPaying: 0, childrenFree: 0, infants: 0 })
    const familyPayload = makePayload({ adults: 1, childrenPaying: 0, childrenFree: 0, infants: 0 })
    const mainTransport = {
      id: 'main-shared-transport',
      title: 'Main coach',
      summary: 'Main group transport',
      price: 600,
      pricingMode: 'total' as const,
      transportNetCost: 300,
      transportNetCurrency: 'GBP',
    }
    const referenceTransport = {
      id: 'family-reference-transport',
      title: 'Family reference only',
      summary: 'Shown on the family invoice',
      price: 50,
      pricingMode: 'per_person' as const,
      transportNetCost: 900,
      transportNetCurrency: 'GBP',
    }
    const families = [
      {
        quoteId: 'quote-lead',
        familyLabel: 'Lead family',
        payload: leadPayload,
        combination: makeCombination({ transportOption: mainTransport }),
      },
      {
        quoteId: 'quote-family',
        familyLabel: 'Second family',
        payload: familyPayload,
        combination: makeCombination({ transportOption: referenceTransport }),
      },
    ]

    const physicalDraft = buildSharedGroupTransportDraft(families, 'quote-lead')
    const allocations = physicalDraft?.metadata.familyAllocations as Array<{
      quoteId: string
      bookedCost: number
      soldPrice: number
      referenceOptionId: string
    }>
    const familyDraft = buildPackageQuoteReservationDrafts({
      payload: familyPayload,
      combination: families[1].combination,
      familyLabel: 'Second family',
      sharedGroupTransportAllocation: true,
    }).find((draft) => draft.reservationType === 'transport')

    expect(physicalDraft).toMatchObject({
      title: 'Group main transport',
      suggestedBookedCost: 0,
      soldPriceTotal: 650,
      metadata: {
        calculationSourceOptionId: 'main-shared-transport',
        totalPassengerCount: 5,
        totalSoldPrice: 650,
      },
    })
    expect(allocations).toEqual([
      expect.objectContaining({ quoteId: 'quote-lead', bookedCost: 240, soldPrice: 600 }),
      expect.objectContaining({
        quoteId: 'quote-family',
        bookedCost: 60,
        soldPrice: 50,
        referenceOptionId: 'family-reference-transport',
      }),
    ])
    expect(familyDraft).toMatchObject({
      soldPriceTotal: 50,
      suggestedBookedCost: 0,
      metadata: {
        invoiceReferenceOnly: true,
        individualQuotedSoldPrice: 50,
        optionId: 'family-reference-transport',
      },
    })
  })

  it('keeps refund adjustment credit out of reservation discounts', () => {
    const payload = makePayload()
    const combination = makeCombination({
      staySelections: [
        {
          groupId: 'makkah',
          groupLabel: 'Makkah',
          option: { id: 'hotel', title: 'Hotel', summary: '', price: 4000 },
        },
      ],
      grossPrice: 4000,
      packageSubtotalPrice: 4000,
      totalPrice: 400,
      refundAdjustmentTotal: 3061,
      offerDiscountTotal: 539,
    })

    const drafts = buildPackageQuoteReservationDrafts({ payload, combination })
    const accountingTotal = drafts.reduce(
      (total, draft) => total + draft.soldPriceTotal - draft.discountTotal,
      0,
    )

    expect(accountingTotal).toBe(3461)
    expect(drafts).toContainEqual(
      expect.objectContaining({
        syncKey: 'package-adjustment',
        discountTotal: 539,
      }),
    )
  })

  it('preserves an accepted offer after its deadline when a converted quote is rebuilt', () => {
    const payload = makePayload({
      stayGroups: [
        {
          id: 'makkah',
          label: 'Makkah',
          options: [{ id: 'hotel', title: 'Hotel', summary: '', price: 1000 }],
        },
      ],
      limitedTimeOffers: [
        {
          id: 'accepted-offer',
          title: 'Accepted early bird',
          summary: '',
          expiresAt: '2020-01-01T00:00:00.000Z',
          discountAmount: 100,
          discountMode: 'total',
          discountType: 'early_bird',
          eligibleServices: ['hotel'],
          active: true,
        },
      ],
    })
    const selection = { stayOptionIds: { makkah: 'hotel' } }

    expect(resolvePackageSelection(payload, selection).combination.totalPrice).toBe(1000)
    expect(
      resolvePackageSelection(payload, selection, {
        preserveAppliedOfferIds: ['accepted-offer'],
      }).combination.totalPrice,
    ).toBe(900)
  })
})
