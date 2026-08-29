import type {
  PackageCombination,
  PackageComponentOption,
  PackageQuotePayload,
} from '@/app/types/packages'
import { getLinkedFlightOptionTotal, getPackageRefundAdjustmentTotal } from '@/lib/packageQuote'

export type PackageQuoteReservationDraft = {
  syncKey: string
  sourceKey: string
  reservationType: 'flight' | 'hotel' | 'visa' | 'transport' | 'other'
  title: string
  soldPriceTotal: number
  discountTotal: number
  suggestedBookedCost: number
  internalNotes: string | null
  metadata: Record<string, unknown>
}

export type PackageQuoteReservationFamily = {
  quoteId: string
  groupMemberId?: string | null
  familyLabel?: string | null
  payload: PackageQuotePayload
  combination: PackageCombination
}

export type SharedGroupTransportFamilyAllocation = {
  quoteId: string
  groupMemberId: string | null
  familyLabel: string | null
  passengerCount: number
  bookedCost: number
  soldPrice: number
  referenceOptionId: string | null
  referenceOptionTitle: string | null
}

function roundMoney(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100
}

function roundSignedMoney(value: number) {
  return Math.round(value * 100) / 100
}

function optionTotal(option: PackageComponentOption | null, passengerCount: number) {
  if (!option) return 0
  return roundMoney(option.price * (option.pricingMode === 'per_person' ? passengerCount : 1))
}

function hasTieredFlightPricing(option: PackageComponentOption | null) {
  if (!option) return false
  return Boolean(
    (option.adultPrice || 0) > 0 || (option.childPrice || 0) > 0 || (option.infantPrice || 0) > 0,
  )
}

function flightTotal(option: PackageComponentOption | null, payload: PackageQuotePayload) {
  if (!option) return 0
  if (!hasTieredFlightPricing(option)) {
    return optionTotal(
      option,
      payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants,
    )
  }
  return roundMoney(
    (option.adultPrice || 0) * payload.adults +
      (option.childPrice || 0) * (payload.childrenPaying + payload.childrenFree) +
      (option.infantPrice || 0) * payload.infants,
  )
}

function visaQuantity(option: PackageComponentOption, payload: PackageQuotePayload) {
  return option.quantity && option.quantity > 0
    ? option.quantity
    : payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
}

function visaTotal(option: PackageComponentOption, payload: PackageQuotePayload) {
  return roundMoney(
    option.price * (option.pricingMode === 'per_person' ? visaQuantity(option, payload) : 1),
  )
}

function cleanSummary(option: PackageComponentOption | null) {
  return option?.summary?.trim() || null
}

function familyPrefix(familyLabel?: string | null) {
  return familyLabel ? `${familyLabel} - ` : ''
}

export function buildPackageQuoteReservationDrafts({
  payload,
  combination,
  familyLabel,
  sharedGroupTransportAllocation = false,
}: {
  payload: PackageQuotePayload
  combination: PackageCombination
  familyLabel?: string | null
  sharedGroupTransportAllocation?: boolean
}) {
  const servicePassengers =
    payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
  const prefix = familyPrefix(familyLabel)
  const drafts: PackageQuoteReservationDraft[] = []
  let componentTotal = 0

  if (combination.flightOption) {
    const sold = flightTotal(combination.flightOption, payload)
    componentTotal += sold
    drafts.push({
      syncKey: 'flight-main',
      sourceKey: `flight-${combination.flightOption.id}`,
      reservationType: 'flight',
      title: `${prefix}Flight - ${combination.flightOption.title || 'Selected flight'}`,
      soldPriceTotal: sold,
      discountTotal: 0,
      suggestedBookedCost: 0,
      internalNotes: cleanSummary(combination.flightOption),
      metadata: {
        optionId: combination.flightOption.id,
        flightPart: 'main',
      },
    })
  }

  combination.linkedFlightSelections.forEach((selection) => {
    const sold = getLinkedFlightOptionTotal(selection.group, selection.option, payload)
    componentTotal += sold
    drafts.push({
      syncKey: `flight-linked-${selection.group.id}`,
      sourceKey: `linked-flight-${selection.group.id}-${selection.option.id}`,
      reservationType: 'flight',
      title: `${prefix}Flight leg - ${selection.group.routeLabel || selection.option.airlineName}`,
      soldPriceTotal: sold,
      discountTotal: 0,
      suggestedBookedCost: 0,
      internalNotes: [
        selection.option.airlineName,
        selection.option.summary,
        `Quoted linked leg value: ${combination.currency} ${sold.toFixed(2)}`,
      ]
        .filter(Boolean)
        .join('\n'),
      metadata: {
        flightPart: 'linked_leg',
        linkedFlightSelection: {
          groupId: selection.group.id,
          routeLabel: selection.group.routeLabel,
          optionId: selection.option.id,
          airlineName: selection.option.airlineName,
          summary: selection.option.summary,
        },
      },
    })
  })

  combination.staySelections.forEach((stay) => {
    const addonTotal = (stay.addonOptions || []).reduce(
      (total, addon) => total + Number(addon.adjustedPrice ?? addon.price ?? 0),
      0,
    )
    const sold = roundMoney(stay.option.price + addonTotal)
    componentTotal += sold
    drafts.push({
      syncKey: `hotel-${stay.groupId}`,
      sourceKey: `hotel-${stay.groupId}-${stay.option.id}`,
      reservationType: 'hotel',
      title: `${prefix}${stay.groupLabel} hotel - ${stay.option.title || 'Selected hotel'}`,
      soldPriceTotal: sold,
      discountTotal: 0,
      suggestedBookedCost: 0,
      internalNotes: [
        cleanSummary(stay.option),
        stay.addonOptions?.length
          ? `Selected extras:\n${stay.addonOptions
              .map(
                (addon) =>
                  `${addon.label}: ${combination.currency} ${Number(
                    addon.adjustedPrice ?? addon.price ?? 0,
                  ).toFixed(2)}`,
              )
              .join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      metadata: {
        stayGroupId: stay.groupId,
        stayGroupLabel: stay.groupLabel,
        optionId: stay.option.id,
        addonOptions: stay.addonOptions || [],
      },
    })
  })

  combination.visaOptions.forEach((option) => {
    const sold = visaTotal(option, payload)
    componentTotal += sold
    drafts.push({
      syncKey: `visa-${option.id}`,
      sourceKey: `visa-${option.id}`,
      reservationType: 'visa',
      title: `${prefix}Visa - ${option.title || 'Selected visa'}`,
      soldPriceTotal: sold,
      discountTotal: 0,
      suggestedBookedCost: 0,
      internalNotes: cleanSummary(option),
      metadata: {
        optionId: option.id,
        quantity: visaQuantity(option, payload),
        visaPassengerCategory: option.visaPassengerCategory || 'all',
      },
    })
  })

  if (combination.transportOption) {
    const quotedSold = optionTotal(combination.transportOption, servicePassengers)
    const sold = quotedSold
    const transportNetCost = Number(combination.transportOption.transportNetCost || 0)
    componentTotal += sold
    drafts.push({
      syncKey: sharedGroupTransportAllocation ? 'transport-family-allocation' : 'transport',
      sourceKey: `transport-${combination.transportOption.id}`,
      reservationType: 'transport',
      title: sharedGroupTransportAllocation
        ? `${prefix}Shared group transport`
        : `${prefix}Transport - ${combination.transportOption.title || 'Selected transport'}`,
      soldPriceTotal: sold,
      discountTotal: 0,
      suggestedBookedCost:
        !sharedGroupTransportAllocation && transportNetCost > 0 ? transportNetCost : 0,
      internalNotes: cleanSummary(combination.transportOption),
      metadata: {
        sharedGroupTransport: sharedGroupTransportAllocation,
        billingAllocation: sharedGroupTransportAllocation,
        optionId: combination.transportOption.id,
        includesZiyarat: Boolean(combination.transportOption.includesZiyarat),
        includesTourGuide: Boolean(combination.transportOption.includesTourGuide),
        transportRoutes: combination.transportOption.transportRoutes || [],
        transportMainSupplierId: combination.transportOption.transportMainSupplierId || '',
        transportMainSupplierName: combination.transportOption.transportMainSupplierName || '',
        transportNetCost,
        transportNetCurrency:
          combination.transportOption.transportNetCurrency || combination.currency,
        ...(sharedGroupTransportAllocation
          ? {
              invoiceReferenceOnly: true,
              calculationReferenceOnly: true,
              individualQuotedSoldPrice: quotedSold,
            }
          : {}),
      },
    })
  }

  const refundAdjustmentTotal =
    Number(combination.refundAdjustmentTotal || 0) || getPackageRefundAdjustmentTotal(payload)
  const accountingSaleTotal = combination.totalPrice + refundAdjustmentTotal
  const adjustment = roundSignedMoney(accountingSaleTotal - componentTotal)
  if (adjustment > 0) {
    drafts.push({
      syncKey: 'package-adjustment',
      sourceKey: 'package-pricing-adjustment',
      reservationType: 'other',
      title: `${prefix}Package pricing adjustment`,
      soldPriceTotal: adjustment,
      discountTotal: 0,
      suggestedBookedCost: 0,
      internalNotes: 'Auto-generated adjustment for processing fees or package-level pricing.',
      metadata: { adjustmentType: 'surcharge' },
    })
  } else if (adjustment < 0) {
    drafts.push({
      syncKey: 'package-adjustment',
      sourceKey: 'package-discount-adjustment',
      reservationType: 'other',
      title: `${prefix}Package discount adjustment`,
      soldPriceTotal: 0,
      discountTotal: Math.abs(adjustment),
      suggestedBookedCost: 0,
      internalNotes: 'Auto-generated adjustment for package-level discounts.',
      metadata: { adjustmentType: 'discount' },
    })
  }

  return drafts
}

export function buildSharedGroupTransportDraft(
  families: PackageQuoteReservationFamily[],
  mainQuoteId?: string | null,
): PackageQuoteReservationDraft | null {
  const sourceFamily =
    families.find(
      (family) => family.quoteId === mainQuoteId && family.combination.transportOption,
    ) || families.find((family) => family.combination.transportOption)
  const option = sourceFamily?.combination.transportOption
  if (!sourceFamily || !option) return null
  const transportNetCost = Number(option.transportNetCost || 0)
  const passengerCounts = families.map((family) =>
    Math.max(
      0,
      family.payload.adults +
        family.payload.childrenPaying +
        family.payload.childrenFree +
        family.payload.infants,
    ),
  )
  const totalPassengers = passengerCounts.reduce((total, count) => total + count, 0)
  const allocationWeights =
    totalPassengers > 0 ? passengerCounts : families.map(() => (families.length > 0 ? 1 : 0))
  const totalWeight = allocationWeights.reduce((total, count) => total + count, 0)
  const familySoldPrices = families.map((family, index) =>
    optionTotal(family.combination.transportOption, passengerCounts[index] || 0),
  )
  const totalSoldPrice = roundMoney(
    familySoldPrices.reduce((total, soldPrice) => total + soldPrice, 0),
  )

  const allocateByPassenger = (total: number) => {
    let allocated = 0
    return allocationWeights.map((weight, index) => {
      const amount =
        index === allocationWeights.length - 1
          ? roundMoney(total - allocated)
          : roundMoney(totalWeight > 0 ? (total * weight) / totalWeight : 0)
      allocated = roundMoney(allocated + amount)
      return amount
    })
  }
  const bookedAllocations = allocateByPassenger(transportNetCost)
  const familyAllocations: SharedGroupTransportFamilyAllocation[] = families.map(
    (family, index) => ({
      quoteId: family.quoteId,
      groupMemberId: family.groupMemberId || null,
      familyLabel: family.familyLabel || null,
      passengerCount: passengerCounts[index] || 0,
      bookedCost: bookedAllocations[index] || 0,
      soldPrice: familySoldPrices[index] || 0,
      referenceOptionId: family.combination.transportOption?.id || null,
      referenceOptionTitle: family.combination.transportOption?.title || null,
    }),
  )

  return {
    syncKey: 'transport-group-physical',
    sourceKey: 'shared-group-transport',
    reservationType: 'transport',
    title: 'Group main transport',
    soldPriceTotal: totalSoldPrice,
    discountTotal: 0,
    suggestedBookedCost: 0,
    internalNotes: cleanSummary(option),
    metadata: {
      sharedGroupTransport: true,
      physicalReservation: true,
      optionId: option.id,
      transportRoutes: option.transportRoutes || [],
      transportMainSupplierId: option.transportMainSupplierId || '',
      transportMainSupplierName: option.transportMainSupplierName || '',
      transportNetCost,
      transportNetCurrency: option.transportNetCurrency || sourceFamily.combination.currency,
      calculationSourceQuoteId: sourceFamily.quoteId,
      calculationSourceOptionId: option.id,
      calculationSourceOptionTitle: option.title || null,
      totalPassengerCount: totalPassengers,
      totalSoldPrice,
      soldPriceOverride: false,
      derivedSoldPrice: totalSoldPrice,
      allocationBasis: 'per_passenger',
      familyAllocations,
    },
  }
}
