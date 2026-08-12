import type {
  PackageCombination,
  PackageComponentOption,
  PackageHotelAddonOption,
  PackageLimitedTimeOffer,
  PackageLinkedFlightGroup,
  PackageLinkedFlightOption,
  PackagePaymentBreakdown,
  PackageQuotePayload,
  PackageResolvedSelection,
  PackageSelectionInput,
  PackageTransportRouteSelection,
} from '@/app/types/packages'

/**
 * Explicit allow-list projection for customer-facing quote responses.
 *
 * Keep this projection exhaustive instead of spreading domain objects: quote
 * JSON can outlive the code version that created it, so unknown historical or
 * future staff-only properties must fail closed at the public boundary.
 */
function createPublicTransportRoute(route: PackageTransportRouteSelection) {
  return {
    id: route.id,
    kind: route.kind,
    routeId: route.routeId,
    routeName: route.routeName,
    vehicleTypeId: route.vehicleTypeId,
    vehicleLabel: route.vehicleLabel,
  }
}

function createPublicHotelAddon(addon: PackageHotelAddonOption): PackageHotelAddonOption {
  return {
    id: addon.id,
    label: addon.label,
    price: addon.price,
  } as PackageHotelAddonOption
}

function createPublicPackageOption(option: PackageComponentOption): PackageComponentOption {
  return {
    id: option.id,
    title: option.title,
    summary: option.summary,
    price: option.price,
    hotelAddonOptions: option.hotelAddonOptions?.map(createPublicHotelAddon),
    pricingMode: option.pricingMode,
    isDefault: option.isDefault,
    adultPrice: option.adultPrice,
    childPrice: option.childPrice,
    infantPrice: option.infantPrice,
    quantity: option.quantity,
    visaPassengerCategory: option.visaPassengerCategory,
    includesZiyarat: option.includesZiyarat,
    includesTourGuide: option.includesTourGuide,
    transportRoutes: option.transportRoutes?.map(createPublicTransportRoute).map(
      (route) =>
        ({
          ...route,
          // The browser normalizer supplies inert defaults for the omitted
          // supplier and cost fields; none are serialized in this DTO.
        }) as PackageTransportRouteSelection,
    ),
  }
}

function createPublicLinkedFlightOption(
  option: PackageLinkedFlightOption,
): PackageLinkedFlightOption {
  return {
    id: option.id,
    airlineName: option.airlineName,
    summary: option.summary,
    adultPrice: option.adultPrice,
    childPrice: option.childPrice,
    infantPrice: option.infantPrice,
    adultDelta: option.adultDelta,
    childDelta: option.childDelta,
    infantDelta: option.infantDelta,
    isDefault: option.isDefault,
  }
}

function createPublicLinkedFlightGroup(group: PackageLinkedFlightGroup): PackageLinkedFlightGroup {
  return {
    id: group.id,
    baseFlightOptionId: group.baseFlightOptionId,
    routeLabel: group.routeLabel,
    defaultOptionId: group.defaultOptionId,
    options: group.options.map(createPublicLinkedFlightOption),
  }
}

function createPublicOffer(offer: PackageLimitedTimeOffer): PackageLimitedTimeOffer {
  return {
    id: offer.id,
    title: offer.title,
    summary: offer.summary,
    expiresAt: offer.expiresAt,
    discountAmount: offer.discountAmount,
    discountMode: offer.discountMode,
    discountType: offer.discountType,
    eligibleServices: offer.eligibleServices ? [...offer.eligibleServices] : undefined,
    visaOptionId: offer.visaOptionId,
    visaPassengerCategory: offer.visaPassengerCategory,
    visaQuantity: offer.visaQuantity,
    active: offer.active,
  }
}

function createPublicPaymentBreakdown(
  value: Partial<PackagePaymentBreakdown> | null | undefined,
): PackagePaymentBreakdown | null | undefined {
  if (!value) return value
  return {
    cash: value.cash ?? 0,
    bankTransfer: value.bankTransfer ?? 0,
    card: value.card ?? 0,
  }
}

export function createPublicPackageQuotePayload(value: PackageQuotePayload): PackageQuotePayload {
  return {
    title: value.title,
    packageType: value.packageType,
    currency: value.currency,
    adults: value.adults,
    childrenPaying: value.childrenPaying,
    childrenFree: value.childrenFree,
    infants: value.infants,
    itineraryOrder: [...value.itineraryOrder],
    departureDate: value.departureDate,
    returnDate: value.returnDate,
    stayGroups: value.stayGroups.map((group) => ({
      id: group.id,
      label: group.label,
      options: group.options.map(createPublicPackageOption),
    })),
    flightOptions: value.flightOptions.map(createPublicPackageOption),
    linkedFlightGroups: value.linkedFlightGroups.map(createPublicLinkedFlightGroup),
    visaOptions: value.visaOptions.map(createPublicPackageOption),
    transportOptions: value.transportOptions.map(createPublicPackageOption),
    limitedTimeOffers: value.limitedTimeOffers.map(createPublicOffer),
    cardProcessingFeePercent: value.cardProcessingFeePercent,
    depositRequired: value.depositRequired,
    depositAmount: value.depositAmount,
  } as PackageQuotePayload
}

export function createPublicPackageSelection(
  selection: PackageSelectionInput,
): PackageSelectionInput {
  return {
    stayOptionIds: { ...selection.stayOptionIds },
    hotelAddonOptionIds: selection.hotelAddonOptionIds
      ? Object.fromEntries(
          Object.entries(selection.hotelAddonOptionIds).map(([groupId, optionIds]) => [
            groupId,
            [...optionIds],
          ]),
        )
      : undefined,
    flightOptionId: selection.flightOptionId,
    linkedFlightOptionIds: selection.linkedFlightOptionIds
      ? { ...selection.linkedFlightOptionIds }
      : undefined,
    visaOptionId: selection.visaOptionId,
    transportOptionId: selection.transportOptionId,
    paymentMethod: selection.paymentMethod,
    paymentBreakdown: createPublicPaymentBreakdown(selection.paymentBreakdown),
    paymentIntent: selection.paymentIntent,
    installmentRequested: selection.installmentRequested,
    depositPaymentMethod: selection.depositPaymentMethod,
    termsAccepted: selection.termsAccepted,
  }
}

function createPublicPackageCombination(combination: PackageCombination): PackageCombination {
  return {
    id: combination.id,
    staySelections: combination.staySelections.map((stay) => ({
      groupId: stay.groupId,
      groupLabel: stay.groupLabel,
      option: createPublicPackageOption(stay.option),
      addonOptions: stay.addonOptions?.map(createPublicHotelAddon),
    })),
    flightOption: combination.flightOption
      ? createPublicPackageOption(combination.flightOption)
      : null,
    linkedFlightSelections: combination.linkedFlightSelections.map((selection) => ({
      group: createPublicLinkedFlightGroup(selection.group),
      option: createPublicLinkedFlightOption(selection.option),
    })),
    visaOption: combination.visaOption ? createPublicPackageOption(combination.visaOption) : null,
    visaOptions: combination.visaOptions.map(createPublicPackageOption),
    transportOption: combination.transportOption
      ? createPublicPackageOption(combination.transportOption)
      : null,
    packageSubtotalPrice: combination.packageSubtotalPrice,
    paymentMethod: combination.paymentMethod,
    paymentBreakdown: createPublicPaymentBreakdown(combination.paymentBreakdown),
    paymentSurchargeTotal: combination.paymentSurchargeTotal,
    totalPrice: combination.totalPrice,
    grossPrice: combination.grossPrice,
    offerDiscountTotal: combination.offerDiscountTotal,
    perPersonPrice: combination.perPersonPrice,
    payingGuests: combination.payingGuests,
    servicePassengers: combination.servicePassengers,
    currency: combination.currency,
    appliedOffers: combination.appliedOffers.map(createPublicOffer),
  }
}

export function createPublicResolvedPackageSelection(
  resolved: PackageResolvedSelection | null | undefined,
): PackageResolvedSelection | null {
  if (!resolved) return null

  return {
    selection: createPublicPackageSelection(resolved.selection),
    combination: createPublicPackageCombination(resolved.combination),
  }
}
