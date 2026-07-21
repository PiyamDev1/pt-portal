import type {
  PackageCombination,
  PackageComponentOption,
  PackageDiscountMode,
  PackageLinkedPackageGroupSnapshot,
  PackageLinkedFlightGroup,
  PackageLinkedFlightOption,
  PackageLimitedTimeOffer,
  PackagePassengerPriceBreakdown,
  PackagePaymentBreakdown,
  PackagePaymentIntent,
  PackagePaymentMethod,
  PackagePricingMode,
  PackageQuotePayload,
  PackageResolvedSelection,
  PackageSelectionInput,
  PackageStayGroup,
  PackageTransportRouteKind,
  PackageTransportRouteSelection,
  TravelPackageQuote,
  TravelPackageType,
} from '@/app/types/packages'

const VALID_PACKAGE_TYPES = new Set<TravelPackageType>(['umrah', 'ziyarat', 'holiday'])
const VALID_PRICING_MODES = new Set<PackagePricingMode>(['total', 'per_person'])
const VALID_DISCOUNT_MODES = new Set<PackageDiscountMode>(['total', 'per_person'])
const VALID_PAYMENT_METHODS = new Set<PackagePaymentMethod>(['cash', 'bank_transfer', 'card'])
const VALID_PAYMENT_INTENTS = new Set<PackagePaymentIntent>([
  'full_payment',
  'deposit_only',
  'installment_request',
])
const VALID_TRANSPORT_ROUTE_KINDS = new Set<PackageTransportRouteKind>([
  'transfer',
  'makkah_ziyarat',
  'madinah_ziyarat',
])

export const DEFAULT_PACKAGE_CURRENCY = 'GBP'
export const DEFAULT_PACKAGE_EXPIRY_HOURS = 72
export const DEFAULT_CARD_PROCESSING_FEE_PERCENT = 3

export function getDefaultPackageExpiry(hours = DEFAULT_PACKAGE_EXPIRY_HOURS) {
  const nowToSecond = Math.floor(Date.now() / 1000) * 1000
  return new Date(nowToSecond + hours * 60 * 60 * 1000).toISOString()
}

export function normalizePackageExpiry(value: unknown, fallback = getDefaultPackageExpiry()) {
  if (typeof value !== 'string') return fallback
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return fallback
  return new Date(timestamp).toISOString()
}

export function isPackageQuoteExpired(expiresAt: string | null | undefined, now = Date.now()) {
  if (!expiresAt) return true
  const timestamp = Date.parse(expiresAt)
  return !Number.isFinite(timestamp) || timestamp <= now
}

export function createPackageShareToken() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 24)
}

export function createPackageOptionId(prefix = 'option') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

export function createTravelPackageReference() {
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  return `PT-${token}`
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function asText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, parsed)
}

function asInteger(value: unknown, fallback = 0) {
  return Math.floor(asNumber(value, fallback))
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function asOptionalPositiveNumber(value: unknown) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.max(0, parsed)
}

function normalizePackageType(value: unknown): TravelPackageType {
  return VALID_PACKAGE_TYPES.has(value as TravelPackageType)
    ? (value as TravelPackageType)
    : 'umrah'
}

function normalizeCurrency(value: unknown) {
  const currency = asString(value, DEFAULT_PACKAGE_CURRENCY).toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_PACKAGE_CURRENCY
}

function normalizePricingMode(value: unknown, fallback: PackagePricingMode): PackagePricingMode {
  return VALID_PRICING_MODES.has(value as PackagePricingMode)
    ? (value as PackagePricingMode)
    : fallback
}

function normalizeDiscountMode(value: unknown, fallback: PackageDiscountMode): PackageDiscountMode {
  return VALID_DISCOUNT_MODES.has(value as PackageDiscountMode)
    ? (value as PackageDiscountMode)
    : fallback
}

function normalizePaymentMethod(value: unknown): PackagePaymentMethod {
  return VALID_PAYMENT_METHODS.has(value as PackagePaymentMethod)
    ? (value as PackagePaymentMethod)
    : 'bank_transfer'
}

function normalizePaymentIntent(value: unknown): PackagePaymentIntent {
  return VALID_PAYMENT_INTENTS.has(value as PackagePaymentIntent)
    ? (value as PackagePaymentIntent)
    : 'full_payment'
}

function normalizeTransportRouteSelection(
  raw: unknown,
  fallbackId: string,
): PackageTransportRouteSelection | null {
  const candidate = raw as Partial<PackageTransportRouteSelection> | null
  const routeId = asString(candidate?.routeId)
  const routeName = asString(candidate?.routeName)
  const supplierId = asString(candidate?.supplierId)
  const supplierName = asString(candidate?.supplierName)
  const vehicleTypeId = asString(candidate?.vehicleTypeId)
  const vehicleLabel = asString(candidate?.vehicleLabel)
  const kind = VALID_TRANSPORT_ROUTE_KINDS.has(candidate?.kind as PackageTransportRouteKind)
    ? (candidate?.kind as PackageTransportRouteKind)
    : 'transfer'

  if (!routeId && !routeName) return null

  return {
    id: asString(candidate?.id, fallbackId),
    kind,
    routeId,
    routeName: routeName || 'Transport route',
    supplierId,
    supplierName,
    vehicleTypeId,
    vehicleLabel,
    costPrice: asNumber(candidate?.costPrice),
    currency: normalizeCurrency(candidate?.currency || DEFAULT_PACKAGE_CURRENCY),
    baseCostPriceGbp: asNumber(candidate?.baseCostPriceGbp),
    costPriceGbp: asNumber(candidate?.costPriceGbp),
    exchangeRate: asNumber(candidate?.exchangeRate),
    exchangeRateMode: candidate?.exchangeRateMode === 'sar_per_gbp' ? 'sar_per_gbp' : undefined,
    damageRecoveryMarginMode:
      candidate?.damageRecoveryMarginMode === 'percent' ? 'percent' : 'fixed',
    damageRecoveryMarginValue: asNumber(candidate?.damageRecoveryMarginValue),
    damageRecoveryMarginAmountGbp: asNumber(candidate?.damageRecoveryMarginAmountGbp),
  }
}

function normalizeTransportRoutes(raw: unknown) {
  const values = Array.isArray(raw) ? raw : []
  return values
    .map((value, index) => normalizeTransportRouteSelection(value, `transport-route-${index + 1}`))
    .filter((value): value is PackageTransportRouteSelection => Boolean(value))
}

function normalizeLinkedFlightOption(
  raw: unknown,
  fallbackId: string,
): PackageLinkedFlightOption | null {
  const candidate = raw as Partial<PackageLinkedFlightOption> | null
  const airlineName = asString(candidate?.airlineName)
  const summary = asText(candidate?.summary)
  const adultDelta = asNumber(candidate?.adultDelta)
  const childDelta = asNumber(candidate?.childDelta)
  const infantDelta = asNumber(candidate?.infantDelta)

  if (
    !airlineName &&
    !summary.trim() &&
    adultDelta === 0 &&
    childDelta === 0 &&
    infantDelta === 0
  ) {
    return null
  }

  return {
    id: asString(candidate?.id, fallbackId),
    airlineName: airlineName || summary.trim().split('\n')[0] || 'Flight option',
    summary,
    adultDelta,
    childDelta,
    infantDelta,
    isDefault: asBoolean(candidate?.isDefault),
  }
}

function normalizeLinkedFlightOptions(raw: unknown, groupId: string) {
  const values = Array.isArray(raw) ? raw : []
  return values
    .map((value, index) =>
      normalizeLinkedFlightOption(value, `${groupId}-linked-flight-${index + 1}`),
    )
    .filter((value): value is PackageLinkedFlightOption => Boolean(value))
}

function normalizeLinkedFlightGroup(
  raw: unknown,
  fallbackId: string,
): PackageLinkedFlightGroup | null {
  const candidate = raw as Partial<PackageLinkedFlightGroup> | null
  const id = asString(candidate?.id, fallbackId)
  const routeLabel = asString(candidate?.routeLabel)
  const options = normalizeLinkedFlightOptions(candidate?.options, id)

  if (!routeLabel && options.length === 0) return null

  const normalizedOptions = normalizeDefaultLinkedFlightOptions(options)
  const defaultOption = getDefaultLinkedFlightOption(normalizedOptions)

  return {
    id,
    baseFlightOptionId: asString(candidate?.baseFlightOptionId) || null,
    routeLabel: routeLabel || 'Flight leg',
    defaultOptionId: asString(candidate?.defaultOptionId) || defaultOption?.id || null,
    options: normalizedOptions,
  }
}

function normalizeLinkedFlightGroups(raw: unknown) {
  const values = Array.isArray(raw) ? raw : []
  return values
    .map((value, index) => normalizeLinkedFlightGroup(value, `linked-flight-${index + 1}`))
    .filter((value): value is PackageLinkedFlightGroup => Boolean(value))
}

function normalizeLinkedPackageGroup(raw: unknown): PackageLinkedPackageGroupSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Partial<PackageLinkedPackageGroupSnapshot>
  const groupId = asString(candidate.groupId)
  const groupReference = asString(candidate.groupReference)
  if (!groupId && !groupReference) return null

  const visibilityMode =
    candidate.visibilityMode === 'private' || candidate.visibilityMode === 'shared_group_view'
      ? candidate.visibilityMode
      : 'linked_notice_only'

  const linkedFamilies: PackageLinkedPackageGroupSnapshot['linkedFamilies'] = Array.isArray(
    candidate.linkedFamilies,
  )
    ? (candidate.linkedFamilies
        .map((family) => {
          const value = family as PackageLinkedPackageGroupSnapshot['linkedFamilies'][number]
          const familyLabel = asString(value?.familyLabel)
          if (!familyLabel) return null
          return {
            packageId: asString(value?.packageId) || null,
            quoteId: asString(value?.quoteId) || null,
            familyLabel,
            packageReference: asString(value?.packageReference) || null,
            quoteTitle: asString(value?.quoteTitle) || null,
            customerVisible: asBoolean(value?.customerVisible),
          }
        })
        .filter(Boolean) as PackageLinkedPackageGroupSnapshot['linkedFamilies'])
    : []

  const sharedServices: PackageLinkedPackageGroupSnapshot['sharedServices'] = Array.isArray(
    candidate.sharedServices,
  )
    ? (candidate.sharedServices
        .map((service) => {
          const value = service as PackageLinkedPackageGroupSnapshot['sharedServices'][number]
          const serviceType =
            value?.serviceType === 'guide' ||
            value?.serviceType === 'ziyarat' ||
            value?.serviceType === 'other'
              ? value.serviceType
              : 'transport'
          const title = asString(
            value?.title,
            serviceType === 'transport' ? 'Transport' : 'Service',
          )
          const customerNote = asText(value?.customerNote)
          if (!title && !customerNote.trim()) return null
          return {
            serviceType,
            title,
            customerNote,
            customerVisible: asBoolean(value?.customerVisible, true),
          }
        })
        .filter(Boolean) as PackageLinkedPackageGroupSnapshot['sharedServices'])
    : []

  return {
    groupId,
    groupReference,
    title: asString(candidate.title, groupReference || 'Linked package group'),
    visibilityMode,
    currentFamilyLabel: asString(candidate.currentFamilyLabel, 'This family'),
    linkedFamilies,
    sharedServices,
  }
}

function normalizeOption(
  raw: unknown,
  fallbackId: string,
  defaultPricingMode: PackagePricingMode,
): PackageComponentOption | null {
  const candidate = raw as Partial<PackageComponentOption> | null
  const title = asString(candidate?.title)
  const summary = asText(candidate?.summary)
  const summaryText = summary.trim()
  const price = asNumber(candidate?.price)
  const id = asString(candidate?.id, fallbackId)
  const pricingMode = normalizePricingMode(candidate?.pricingMode, defaultPricingMode)
  const adultPrice = asNumber(candidate?.adultPrice)
  const childPrice = asNumber(candidate?.childPrice)
  const infantPrice = asNumber(candidate?.infantPrice)
  const isDefault = asBoolean(candidate?.isDefault)
  const quantity = asOptionalPositiveNumber(candidate?.quantity)
  const transportRoutes = normalizeTransportRoutes(candidate?.transportRoutes)

  if (
    !title &&
    !summaryText &&
    price <= 0 &&
    adultPrice <= 0 &&
    childPrice <= 0 &&
    infantPrice <= 0 &&
    transportRoutes.length === 0
  ) {
    return null
  }

  return {
    id,
    title: title || summaryText.split('\n')[0] || 'Option',
    summary,
    price,
    pricingMode,
    isDefault,
    adultPrice,
    childPrice,
    infantPrice,
    includesZiyarat: asBoolean(candidate?.includesZiyarat),
    includesTourGuide: asBoolean(candidate?.includesTourGuide),
    transportRoutes,
    transportMainSupplierId: asString(candidate?.transportMainSupplierId),
    transportMainSupplierName: asString(candidate?.transportMainSupplierName),
    transportNetCost: asNumber(candidate?.transportNetCost),
    transportNetCurrency: normalizeCurrency(
      candidate?.transportNetCurrency || DEFAULT_PACKAGE_CURRENCY,
    ),
    ...(quantity ? { quantity } : {}),
  }
}

function normalizeOffer(raw: unknown, fallbackId: string): PackageLimitedTimeOffer | null {
  const candidate = raw as Partial<PackageLimitedTimeOffer> | null
  const title = asString(candidate?.title)
  const summary = asText(candidate?.summary)
  const expiresAt = asString(candidate?.expiresAt)
  const discountAmount = asNumber(candidate?.discountAmount)
  const discountMode = normalizeDiscountMode(candidate?.discountMode, 'total')
  const active = asBoolean(candidate?.active, true)
  const id = asString(candidate?.id, fallbackId)

  if (!title && !summary.trim() && !expiresAt && discountAmount <= 0) return null

  return {
    id,
    title: title || 'Limited time offer',
    summary,
    expiresAt,
    discountAmount,
    discountMode,
    active,
  }
}

function normalizeOffers(raw: unknown) {
  const values = Array.isArray(raw) ? raw : []
  return values
    .map((value, index) => normalizeOffer(value, `offer-${index + 1}`))
    .filter((value): value is PackageLimitedTimeOffer => Boolean(value))
}

function normalizeOptions(raw: unknown, prefix: string, defaultPricingMode: PackagePricingMode) {
  const values = Array.isArray(raw) ? raw : []
  return values
    .map((value, index) => normalizeOption(value, `${prefix}-${index + 1}`, defaultPricingMode))
    .filter((value): value is PackageComponentOption => Boolean(value))
}

function normalizeDefaultOption(options: PackageComponentOption[]) {
  if (options.length === 0) return options
  const defaultIndex = options.findIndex((option) => option.isDefault)
  if (defaultIndex === -1) {
    return options.map((option, index) => ({ ...option, isDefault: index === 0 }))
  }
  return options.map((option, index) => ({ ...option, isDefault: index === defaultIndex }))
}

function normalizeStayGroups(raw: unknown): PackageStayGroup[] {
  const values = Array.isArray(raw) && raw.length > 0 ? raw : []
  const groups = values.map((value, index) => {
    const candidate = value as Partial<PackageStayGroup> | null
    const id = asString(
      candidate?.id,
      index === 0 ? 'makkah' : index === 1 ? 'madinah' : `stay-${index + 1}`,
    )
    return {
      id,
      label: asString(
        candidate?.label,
        index === 0 ? 'Makkah' : index === 1 ? 'Madinah' : `Stay ${index + 1}`,
      ),
      options: normalizeDefaultOption(normalizeOptions(candidate?.options, `${id}-hotel`, 'total')),
    }
  })

  if (groups.length > 0) return groups

  return [
    { id: 'makkah', label: 'Makkah', options: [] },
    { id: 'madinah', label: 'Madinah', options: [] },
  ]
}

export function normalizePackageQuotePayload(input: unknown): PackageQuotePayload {
  const candidate = (input || {}) as Partial<PackageQuotePayload>
  const stayGroups = normalizeStayGroups(candidate.stayGroups)
  const itineraryOrder = Array.isArray(candidate.itineraryOrder)
    ? candidate.itineraryOrder.map((value) => asString(value)).filter(Boolean)
    : stayGroups.map((group) => group.id)

  const flightOptions = normalizeDefaultOption(
    normalizeOptions(candidate.flightOptions, 'flight', 'per_person'),
  )
  const transportOptions = normalizeDefaultOption(
    normalizeOptions(candidate.transportOptions, 'transport', 'total'),
  )

  return {
    title: asString(candidate.title, 'New package quote'),
    packageType: normalizePackageType(candidate.packageType),
    currency: normalizeCurrency(candidate.currency),
    customerName: asString(candidate.customerName),
    customerPhone: asString(candidate.customerPhone),
    customerEmail: asString(candidate.customerEmail),
    adults: asInteger(candidate.adults),
    childrenPaying: asInteger(candidate.childrenPaying),
    childrenFree: asInteger(candidate.childrenFree),
    infants: asInteger(candidate.infants),
    itineraryOrder:
      itineraryOrder.length > 0 ? itineraryOrder : stayGroups.map((group) => group.id),
    departureDate: asString(candidate.departureDate),
    returnDate: asString(candidate.returnDate),
    stayGroups,
    flightOptions,
    linkedFlightGroups: normalizeLinkedFlightGroups(candidate.linkedFlightGroups),
    linkedPackageGroup: normalizeLinkedPackageGroup(candidate.linkedPackageGroup),
    visaOptions: normalizeOptions(candidate.visaOptions, 'visa', 'per_person'),
    transportOptions,
    limitedTimeOffers: normalizeOffers(candidate.limitedTimeOffers),
    cardProcessingFeePercent: asNumber(
      candidate.cardProcessingFeePercent,
      DEFAULT_CARD_PROCESSING_FEE_PERCENT,
    ),
    depositRequired: asBoolean(candidate.depositRequired),
    depositAmount: asNumber(candidate.depositAmount),
    notes: asText(candidate.notes),
  }
}

export function getPayingGuestCount(
  payload: Pick<PackageQuotePayload, 'adults' | 'childrenPaying'>,
) {
  return Math.max(0, payload.adults + payload.childrenPaying)
}

export function getServicePassengerCount(
  payload: Pick<PackageQuotePayload, 'adults' | 'childrenPaying' | 'childrenFree' | 'infants'>,
) {
  return Math.max(
    0,
    payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants,
  )
}

function getFlightChildPassengerCount(
  payload: Pick<PackageQuotePayload, 'childrenPaying' | 'childrenFree'>,
) {
  return Math.max(0, payload.childrenPaying + payload.childrenFree)
}

function getInfantPassengerCount(payload: Pick<PackageQuotePayload, 'infants'>) {
  return Math.max(0, payload.infants)
}

export function buildPassengerSummary(payloadInput: unknown) {
  const payload = normalizePackageQuotePayload(payloadInput)
  const hotelPayingGuests = getPayingGuestCount(payload)
  const servicePassengers = getServicePassengerCount(payload)

  return {
    adults: payload.adults,
    childrenPaying: payload.childrenPaying,
    childrenFree: payload.childrenFree,
    infants: payload.infants,
    totalPassengers: servicePassengers,
    hotelPayingGuests,
    servicePassengers,
  }
}

export function getDefaultPackageNextAction(
  selection: PackageResolvedSelection | null | undefined,
) {
  if (!selection) return 'Finalise customer package option'
  if (selection.selection.paymentIntent === 'installment_request')
    return 'Review installment request'
  if (selection.selection.paymentIntent === 'deposit_only') return 'Send deposit payment details'
  return 'Request passport copies via WhatsApp'
}

export function buildPackageSnapshot(quote: TravelPackageQuote) {
  const payload = normalizePackageQuotePayload(quote.payload)
  return {
    quote: {
      id: quote.id,
      title: quote.title,
      package_type: quote.package_type,
      currency: quote.currency,
      customer_name: quote.customer_name,
      customer_phone: quote.customer_phone,
      customer_email: quote.customer_email,
      share_token: quote.share_token,
      selected_at: quote.selected_at,
      selection_note: quote.selection_note,
      created_at: quote.created_at,
    },
    payload,
    selection: quote.selected_option,
  }
}

function hasTieredFlightPricing(option: PackageComponentOption | null) {
  if (!option) return false
  return Boolean(
    (option.adultPrice || 0) > 0 || (option.childPrice || 0) > 0 || (option.infantPrice || 0) > 0,
  )
}

function getOptionTotal(option: PackageComponentOption | null, passengerCount: number) {
  if (!option) return 0
  return option.price * (option.pricingMode === 'per_person' ? passengerCount : 1)
}

function getVisaOptionQuantity(option: PackageComponentOption, servicePassengers: number) {
  return option.quantity && option.quantity > 0 ? option.quantity : servicePassengers
}

function getVisaOptionTotal(option: PackageComponentOption | null, payload: PackageQuotePayload) {
  if (!option) return 0
  if (option.pricingMode === 'total') return option.price
  return option.price * getVisaOptionQuantity(option, getServicePassengerCount(payload))
}

function getVisaOptionsTotal(options: PackageComponentOption[], payload: PackageQuotePayload) {
  return options.reduce((sum, option) => sum + getVisaOptionTotal(option, payload), 0)
}

function getFlightOptionTotal(option: PackageComponentOption | null, payload: PackageQuotePayload) {
  if (!option) return 0
  if (!hasTieredFlightPricing(option)) {
    return getOptionTotal(option, getServicePassengerCount(payload))
  }

  return (
    (option.adultPrice || 0) * payload.adults +
    (option.childPrice || 0) * getFlightChildPassengerCount(payload) +
    (option.infantPrice || 0) * getInfantPassengerCount(payload)
  )
}

function getDefaultLinkedFlightOption<T extends PackageLinkedFlightOption>(options: T[]) {
  return options.find((option) => option.isDefault) || options[0] || null
}

function normalizeDefaultLinkedFlightOptions<T extends PackageLinkedFlightOption>(options: T[]) {
  if (options.length === 0) return []
  const defaultOption = getDefaultLinkedFlightOption(options)
  return options.map((option) => ({ ...option, isDefault: option.id === defaultOption?.id }))
}

function getDefaultOption<T extends PackageComponentOption>(options: T[]) {
  return options.find((option) => option.isDefault) || options[0] || null
}

export function getLinkedFlightGroupsForFlight(
  payload: PackageQuotePayload,
  flightOption: PackageComponentOption | null,
) {
  return payload.linkedFlightGroups.filter(
    (group) => !group.baseFlightOptionId || group.baseFlightOptionId === flightOption?.id,
  )
}

export function getLinkedFlightOptionForSelection(
  group: PackageLinkedFlightGroup,
  linkedFlightOptionIds: Record<string, string> | null | undefined,
) {
  const requestedId = linkedFlightOptionIds?.[group.id]
  return (
    group.options.find((option) => option.id === requestedId) ||
    group.options.find((option) => option.id === group.defaultOptionId) ||
    getDefaultLinkedFlightOption(group.options)
  )
}

export function getLinkedFlightOptionTotal(
  option: PackageLinkedFlightOption | null,
  payload: PackageQuotePayload,
) {
  if (!option) return 0
  return (
    option.adultDelta * payload.adults +
    option.childDelta * getFlightChildPassengerCount(payload) +
    option.infantDelta * getInfantPassengerCount(payload)
  )
}

function getLinkedFlightSelections(
  payload: PackageQuotePayload,
  flightOption: PackageComponentOption | null,
  linkedFlightOptionIds?: Record<string, string> | null,
) {
  return getLinkedFlightGroupsForFlight(payload, flightOption)
    .map((group) => {
      const option = getLinkedFlightOptionForSelection(group, linkedFlightOptionIds)
      return option ? { group, option } : null
    })
    .filter(
      (
        selection,
      ): selection is { group: PackageLinkedFlightGroup; option: PackageLinkedFlightOption } =>
        Boolean(selection),
    )
}

function getLinkedFlightSelectionsTotal(
  payload: PackageQuotePayload,
  linkedFlightSelections: Array<{
    group: PackageLinkedFlightGroup
    option: PackageLinkedFlightOption
  }>,
) {
  return linkedFlightSelections.reduce(
    (sum, selection) => sum + getLinkedFlightOptionTotal(selection.option, payload),
    0,
  )
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100
}

function getPaymentSurchargeTotal(
  subtotal: number,
  payload: PackageQuotePayload,
  method: PackagePaymentMethod,
) {
  if (method !== 'card' || payload.cardProcessingFeePercent <= 0) return 0
  return roundMoney((subtotal * payload.cardProcessingFeePercent) / 100)
}

export function getPackagePaymentBreakdownTotal(
  breakdown: Partial<PackagePaymentBreakdown> | null | undefined,
) {
  if (!breakdown) return 0
  return roundMoney(
    asNumber(breakdown.cash) + asNumber(breakdown.bankTransfer) + asNumber(breakdown.card),
  )
}

export function normalizePackagePaymentBreakdown(
  value: unknown,
  subtotal: number,
  fallbackMethod: PackagePaymentMethod = 'bank_transfer',
): PackagePaymentBreakdown {
  const candidate = value as Partial<PackagePaymentBreakdown> | null
  const explicit = Boolean(candidate && typeof candidate === 'object')
  const breakdown = {
    cash: explicit ? asNumber(candidate?.cash) : 0,
    bankTransfer: explicit ? asNumber(candidate?.bankTransfer) : 0,
    card: explicit ? asNumber(candidate?.card) : 0,
  }

  if (explicit && getPackagePaymentBreakdownTotal(breakdown) > 0) return breakdown

  return {
    cash: fallbackMethod === 'cash' ? subtotal : 0,
    bankTransfer: fallbackMethod === 'bank_transfer' ? subtotal : 0,
    card: fallbackMethod === 'card' ? subtotal : 0,
  }
}

function getPaymentSurchargeFromBreakdown(
  payload: PackageQuotePayload,
  breakdown: PackagePaymentBreakdown,
) {
  if (payload.cardProcessingFeePercent <= 0 || breakdown.card <= 0) return 0
  return roundMoney((breakdown.card * payload.cardProcessingFeePercent) / 100)
}

export function getPackageCardProcessingFeeTotal(amount: number, payload: PackageQuotePayload) {
  if (amount <= 0 || payload.cardProcessingFeePercent <= 0) return 0
  return roundMoney((amount * payload.cardProcessingFeePercent) / 100)
}

export function getPackageDepositPaymentSummary(
  payload: PackageQuotePayload,
  method: PackagePaymentMethod,
) {
  const depositAmount = roundMoney(payload.depositAmount || 0)
  const processingFee =
    method === 'card' ? getPackageCardProcessingFeeTotal(depositAmount, payload) : 0
  return {
    depositAmount,
    processingFee,
    total: roundMoney(depositAmount + processingFee),
    currency: payload.currency,
  }
}

export function isLimitedTimeOfferActive(offer: PackageLimitedTimeOffer, now = Date.now()) {
  if (!offer.active || offer.discountAmount <= 0) return false
  if (!offer.expiresAt) return true
  const timestamp = Date.parse(offer.expiresAt)
  return Number.isFinite(timestamp) && timestamp > now
}

function getOfferDiscountTotal(offer: PackageLimitedTimeOffer, payingGuests: number) {
  return offer.discountAmount * (offer.discountMode === 'per_person' ? payingGuests : 1)
}

function getActiveOffers(payload: PackageQuotePayload) {
  return payload.limitedTimeOffers.filter((offer) => isLimitedTimeOfferActive(offer))
}

function buildStaySelections(
  groups: PackageStayGroup[],
  index = 0,
  current: PackageCombination['staySelections'] = [],
): PackageCombination['staySelections'][] {
  const group = groups[index]
  if (!group) return [current]
  if (group.options.length === 0) return []

  return group.options.flatMap((option) =>
    buildStaySelections(groups, index + 1, [
      ...current,
      {
        groupId: group.id,
        groupLabel: group.label,
        option,
      },
    ]),
  )
}

export function buildPackageCombinations(payloadInput: unknown, limit = 250): PackageCombination[] {
  const payload = normalizePackageQuotePayload(payloadInput)
  const payingGuests = getPayingGuestCount(payload)
  const servicePassengers = getServicePassengerCount(payload)
  if (payingGuests <= 0) return []

  const staySelections = buildStaySelections(payload.stayGroups)
  if (staySelections.length === 0) return []

  const flightOptions: Array<PackageComponentOption | null> =
    payload.flightOptions.length > 0 ? payload.flightOptions : [null]
  const transportOptions: Array<PackageComponentOption | null> =
    payload.transportOptions.length > 0 ? payload.transportOptions : [null]
  const activeOffers = getActiveOffers(payload)
  const offerDiscountTotal = activeOffers.reduce(
    (sum, offer) => sum + getOfferDiscountTotal(offer, payingGuests),
    0,
  )

  const combinations: PackageCombination[] = []

  for (const stays of staySelections) {
    for (const flightOption of flightOptions) {
      const linkedFlightSelections = getLinkedFlightSelections(payload, flightOption)
      const linkedFlightTotal = getLinkedFlightSelectionsTotal(payload, linkedFlightSelections)
      for (const transportOption of transportOptions) {
        const grossPrice =
          stays.reduce((sum, stay) => sum + stay.option.price, 0) +
          getFlightOptionTotal(flightOption, payload) +
          linkedFlightTotal +
          getVisaOptionsTotal(payload.visaOptions, payload) +
          getOptionTotal(transportOption, servicePassengers)
        const packageSubtotalPrice = Math.max(0, grossPrice - offerDiscountTotal)
        const paymentMethod = normalizePaymentMethod(undefined)
        const paymentSurchargeTotal = getPaymentSurchargeTotal(
          packageSubtotalPrice,
          payload,
          paymentMethod,
        )
        const totalPrice = packageSubtotalPrice + paymentSurchargeTotal

        combinations.push({
          id: [
            ...stays.map((stay) => stay.option.id),
            flightOption?.id || 'no-flight',
            linkedFlightSelections.length > 0
              ? linkedFlightSelections
                  .map((selection) => `${selection.group.id}:${selection.option.id}`)
                  .join('|')
              : 'no-linked-flight',
            payload.visaOptions.length > 0
              ? payload.visaOptions
                  .map((option) => `${option.id}:${option.quantity || 'all'}`)
                  .join('|')
              : 'no-visa',
            transportOption?.id || 'no-transport',
            paymentMethod,
          ].join('__'),
          staySelections: stays,
          flightOption,
          linkedFlightSelections,
          visaOption: payload.visaOptions[0] || null,
          visaOptions: payload.visaOptions,
          transportOption,
          packageSubtotalPrice,
          paymentMethod,
          paymentBreakdown: null,
          paymentSurchargeTotal,
          totalPrice,
          grossPrice,
          offerDiscountTotal,
          perPersonPrice: totalPrice / payingGuests,
          payingGuests,
          servicePassengers,
          currency: payload.currency,
          appliedOffers: activeOffers,
        })
      }
    }
  }

  return combinations.sort((a, b) => a.totalPrice - b.totalPrice).slice(0, limit)
}

function getOrderedStaySelections(payload: PackageQuotePayload, combination: PackageCombination) {
  const order =
    payload.itineraryOrder.length > 0
      ? payload.itineraryOrder
      : payload.stayGroups.map((group) => group.id)
  return [...combination.staySelections].sort((a, b) => {
    const aIndex = order.indexOf(a.groupId)
    const bIndex = order.indexOf(b.groupId)
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
  })
}

export function formatMoney(value: number, currency = DEFAULT_PACKAGE_CURRENCY) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatPassengerSummary(payload: PackageQuotePayload) {
  const parts = [
    payload.adults ? `${payload.adults} Adult${payload.adults === 1 ? '' : 's'}` : '',
    payload.childrenPaying
      ? `${payload.childrenPaying} Child${payload.childrenPaying === 1 ? '' : 'ren'} 5+`
      : '',
    payload.childrenFree
      ? `${payload.childrenFree} Child${payload.childrenFree === 1 ? '' : 'ren'} 2-5`
      : '',
    payload.infants ? `${payload.infants} Infant${payload.infants === 1 ? '' : 's'} under 2` : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'Passengers not set'
}

function formatDateRange(payload: PackageQuotePayload) {
  if (!payload.departureDate && !payload.returnDate) return ''
  const formatDate = (value: string) => {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }
  return [payload.departureDate, payload.returnDate].filter(Boolean).map(formatDate).join(' to ')
}

export function getDefaultPackageSelection(payloadInput: unknown): PackageSelectionInput {
  const payload = normalizePackageQuotePayload(payloadInput)
  return {
    stayOptionIds: Object.fromEntries(
      payload.stayGroups.map((group) => [group.id, getDefaultOption(group.options)?.id || '']),
    ),
    flightOptionId: getDefaultOption(payload.flightOptions)?.id || null,
    linkedFlightOptionIds: Object.fromEntries(
      payload.linkedFlightGroups.map((group) => [
        group.id,
        getLinkedFlightOptionForSelection(group, null)?.id || '',
      ]),
    ),
    visaOptionId: payload.visaOptions[0]?.id || null,
    transportOptionId: getDefaultOption(payload.transportOptions)?.id || null,
    paymentMethod: 'bank_transfer',
    paymentBreakdown: null,
  }
}

export function resolveDefaultPackageSelection(
  payloadInput: unknown,
): PackageResolvedSelection | null {
  try {
    return resolvePackageSelection(payloadInput, getDefaultPackageSelection(payloadInput))
  } catch {
    return null
  }
}

export function buildCustomerPackageOptions(
  payloadInput: unknown,
  limit = 80,
): PackageResolvedSelection[] {
  const payload = normalizePackageQuotePayload(payloadInput)
  const defaultSelection = getDefaultPackageSelection(payload)
  const staySelections = buildStaySelections(payload.stayGroups)

  return staySelections
    .map((stays) => {
      try {
        return resolvePackageSelection(payload, {
          ...defaultSelection,
          stayOptionIds: Object.fromEntries(stays.map((stay) => [stay.groupId, stay.option.id])),
        })
      } catch {
        return null
      }
    })
    .filter((value): value is PackageResolvedSelection => Boolean(value))
    .sort((a, b) => {
      const aIsDefault = Object.entries(defaultSelection.stayOptionIds).every(
        ([groupId, optionId]) => a.selection.stayOptionIds[groupId] === optionId,
      )
      const bIsDefault = Object.entries(defaultSelection.stayOptionIds).every(
        ([groupId, optionId]) => b.selection.stayOptionIds[groupId] === optionId,
      )
      if (aIsDefault !== bIsDefault) return aIsDefault ? -1 : 1
      return a.combination.totalPrice - b.combination.totalPrice
    })
    .slice(0, limit)
}

function getComponentPassengerUnitPrice(
  option: PackageComponentOption | null,
  servicePassengers: number,
) {
  if (!option) return 0
  if (option.pricingMode === 'per_person') return option.price
  if (servicePassengers <= 0) return 0
  return option.price / servicePassengers
}

function getFlightPassengerUnitPrices(
  option: PackageComponentOption | null,
  payload: PackageQuotePayload,
) {
  if (!option) return { adult: 0, child: 0, infant: 0 }
  if (hasTieredFlightPricing(option)) {
    return {
      adult: option.adultPrice || 0,
      child: option.childPrice || 0,
      infant: option.infantPrice || 0,
    }
  }
  const unit = getComponentPassengerUnitPrice(option, getServicePassengerCount(payload))
  return { adult: unit, child: unit, infant: unit }
}

export function getFlightOptionPassengerPrices(
  payloadInput: unknown,
  option: PackageComponentOption | null,
) {
  return getFlightPassengerUnitPrices(option, normalizePackageQuotePayload(payloadInput))
}

export function getFlightOptionPriceDeltas(
  payloadInput: unknown,
  option: PackageComponentOption | null,
  baseOption?: PackageComponentOption | null,
) {
  const payload = normalizePackageQuotePayload(payloadInput)
  const base = getFlightPassengerUnitPrices(
    baseOption || getDefaultOption(payload.flightOptions),
    payload,
  )
  const next = getFlightPassengerUnitPrices(option, payload)
  return {
    adult: next.adult - base.adult,
    child: next.child - base.child,
    infant: next.infant - base.infant,
  }
}

export function getLinkedFlightOptionPriceDeltas(option: PackageLinkedFlightOption | null) {
  return {
    adult: option?.adultDelta || 0,
    child: option?.childDelta || 0,
    infant: option?.infantDelta || 0,
  }
}

export function getFlightOptionTotalDelta(
  payloadInput: unknown,
  option: PackageComponentOption | null,
  baseOption?: PackageComponentOption | null,
) {
  const payload = normalizePackageQuotePayload(payloadInput)
  const base = baseOption || getDefaultOption(payload.flightOptions)
  return getFlightOptionTotal(option, payload) - getFlightOptionTotal(base, payload)
}

export function getPackagePassengerPriceBreakdown(
  payloadInput: unknown,
  combination: PackageCombination,
): PackagePassengerPriceBreakdown {
  const payload = normalizePackageQuotePayload(payloadInput)
  const payingGuests = getPayingGuestCount(payload)
  const servicePassengers = getServicePassengerCount(payload)
  const hotelTotal = combination.staySelections.reduce((sum, stay) => sum + stay.option.price, 0)
  const hotelUnit = payingGuests > 0 ? hotelTotal / payingGuests : 0
  const flightUnits = getFlightPassengerUnitPrices(combination.flightOption, payload)
  const linkedFlightUnits = combination.linkedFlightSelections.reduce(
    (units, selection) => {
      units.adult += selection.option.adultDelta || 0
      units.child += selection.option.childDelta || 0
      units.infant += selection.option.infantDelta || 0
      return units
    },
    { adult: 0, child: 0, infant: 0 },
  )
  const visaTotal = getVisaOptionsTotal(combination.visaOptions, payload)
  const visaUnit = servicePassengers > 0 ? visaTotal / servicePassengers : 0
  const transportUnit = getComponentPassengerUnitPrice(
    combination.transportOption,
    servicePassengers,
  )
  const discountUnit = payingGuests > 0 ? combination.offerDiscountTotal / payingGuests : 0
  const surchargeUnit = payingGuests > 0 ? combination.paymentSurchargeTotal / payingGuests : 0

  const adult = Math.max(
    0,
    hotelUnit +
      flightUnits.adult +
      linkedFlightUnits.adult +
      visaUnit +
      transportUnit -
      discountUnit +
      surchargeUnit,
  )
  const child = Math.max(
    0,
    hotelUnit +
      flightUnits.child +
      linkedFlightUnits.child +
      visaUnit +
      transportUnit -
      discountUnit +
      surchargeUnit,
  )
  const childTwoToFour = Math.max(
    0,
    flightUnits.child + linkedFlightUnits.child + visaUnit + transportUnit,
  )
  const infant = Math.max(
    0,
    flightUnits.infant + linkedFlightUnits.infant + visaUnit + transportUnit,
  )

  return {
    adult,
    child,
    childTwoToFour,
    infant,
    adultTotal: adult * payload.adults,
    childTotal: child * payload.childrenPaying,
    childTwoToFourTotal: childTwoToFour * payload.childrenFree,
    infantTotal: infant * payload.infants,
    total:
      adult * payload.adults +
      child * payload.childrenPaying +
      childTwoToFour * payload.childrenFree +
      infant * payload.infants,
    currency: combination.currency,
  }
}

function formatDelta(value: number, currency: string) {
  if (Math.abs(value) < 0.005) return 'Included'
  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)}`
}

function formatPaymentMethodLabel(method: PackagePaymentMethod) {
  if (method === 'cash') return 'Cash'
  if (method === 'card') return 'Credit Card'
  return 'Bank transfer'
}

function formatVisaLine(option: PackageComponentOption, payload: PackageQuotePayload) {
  const quantity = getVisaOptionQuantity(option, getServicePassengerCount(payload))
  return `${quantity} x ${option.summary || option.title}`
}

function formatTransportLines(option: PackageComponentOption) {
  const routeLines = option.transportRoutes?.length
    ? option.transportRoutes.map(
        (route) => `* ${route.routeName}${route.vehicleLabel ? ` (${route.vehicleLabel})` : ''}`,
      )
    : []
  const lines = routeLines.length > 0 ? routeLines : [option.summary || option.title]
  const hasSpecificZiyaratRoutes = option.transportRoutes?.some(
    (route) => route.kind !== 'transfer',
  )
  if (option.includesZiyarat && !hasSpecificZiyaratRoutes) {
    lines.push('Makkah & Madinah Ziyarat included')
  }
  if (option.includesTourGuide) lines.push('Tour guide included')
  return lines
}

function getLinkedTransportNotes(payload: PackageQuotePayload) {
  return (
    payload.linkedPackageGroup?.sharedServices
      .filter(
        (service) =>
          service.customerVisible && service.serviceType === 'transport' && service.customerNote,
      )
      .map((service) => service.customerNote.trim())
      .filter(Boolean) || []
  )
}

function formatFlightIncludedLines(option: PackageComponentOption) {
  const lines = [`*Airline:* ${option.title || 'Included flight'}`]
  if (option.summary.trim()) lines.push(option.summary.trim())
  return lines
}

function formatLinkedFlightIncludedLines(
  group: PackageLinkedFlightGroup,
  option: PackageLinkedFlightOption,
) {
  const lines = [`*Linked Flight - ${group.routeLabel || 'Flight leg'}*`]
  lines.push(`*Airline:* ${option.airlineName || 'Included airline'}`)
  if (option.summary.trim()) lines.push(option.summary.trim())
  return lines
}

function formatAlternativeFlightLines(
  title: string,
  summary: string,
  delta: number,
  currency: string,
) {
  const lines = [title]
  if (summary.trim()) lines.push(summary.trim())
  lines.push(`Difference: ${formatDelta(delta, currency)} p.p.`)
  return lines
}

function formatOfferDeadline(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatPackageCombinationForCopy(
  payloadInput: unknown,
  combination: PackageCombination,
  optionNumber?: number,
) {
  const payload = normalizePackageQuotePayload(payloadInput)
  const lines: string[] = []

  if (optionNumber !== undefined) {
    lines.push(`*Option ${optionNumber}*`, '')
  }

  lines.push(`***${payload.packageType.toUpperCase()} PACKAGE***`)
  const dateRange = formatDateRange(payload)
  if (dateRange) lines.push(dateRange)
  lines.push(formatPassengerSummary(payload))
  lines.push('')

  if (combination.flightOption) {
    lines.push('***Flights***')
    lines.push(combination.flightOption.summary || combination.flightOption.title)
    combination.linkedFlightSelections.forEach((selection) => {
      lines.push('')
      lines.push(`*${selection.group.routeLabel}*`)
      lines.push(selection.option.summary || selection.option.airlineName)
    })
    lines.push('')
  }

  if (combination.visaOptions.length > 0) {
    lines.push('****Visa****')
    combination.visaOptions.forEach((option) => {
      lines.push(formatVisaLine(option, payload))
    })
    lines.push('')
  }

  if (combination.transportOption) {
    lines.push('****Transport****')
    lines.push(...formatTransportLines(combination.transportOption))
    getLinkedTransportNotes(payload).forEach((note) => {
      lines.push(`* ${note}`)
    })
    lines.push('')
  }

  lines.push('*********HOTELS**********')
  for (const stay of getOrderedStaySelections(payload, combination)) {
    lines.push(`*(${stay.groupLabel})*`)
    lines.push(stay.option.summary || stay.option.title)
    lines.push('')
  }

  if (payload.limitedTimeOffers.length > 0) {
    for (const offer of payload.limitedTimeOffers) {
      lines.push(`****${offer.title.toUpperCase()}****`)
      if (offer.summary.trim()) {
        lines.push(offer.summary)
      }
      if (offer.expiresAt) {
        lines.push(`Valid until ${formatOfferDeadline(offer.expiresAt)}`)
      }
      if (offer.discountAmount > 0) {
        lines.push(
          `Discount ${formatMoney(offer.discountAmount, payload.currency)} ${
            offer.discountMode === 'per_person' ? 'p.p.' : '(Total)'
          }`,
        )
      }
      lines.push('')
    }
  }

  if (combination.offerDiscountTotal > 0) {
    lines.push(
      `*Discount Applied: -${formatMoney(combination.offerDiscountTotal, combination.currency)}*`,
    )
  }
  const breakdown = getPackagePassengerPriceBreakdown(payload, combination)
  lines.push(`Adult 12+: ${formatMoney(breakdown.adult, breakdown.currency)} p.p.`)
  if (payload.childrenPaying > 0) {
    lines.push(`Child 5+: ${formatMoney(breakdown.child, breakdown.currency)} p.p.`)
  }
  if (payload.childrenFree > 0) {
    lines.push(`Child 2-5: ${formatMoney(breakdown.childTwoToFour, breakdown.currency)} p.p.`)
  }
  if (payload.infants > 0) {
    lines.push(`Infant under 2: ${formatMoney(breakdown.infant, breakdown.currency)} p.p.`)
  }
  lines.push(`*Total Package Cost: ${formatMoney(combination.totalPrice, combination.currency)}*`)

  return lines.join('\n').trim()
}

export function formatPackageQuoteForCopy(payloadInput: unknown, limit = 12, packageUrl = '') {
  const payload = normalizePackageQuotePayload(payloadInput)
  const customerOptions = buildCustomerPackageOptions(payload, 250)
  const defaultFlight = getDefaultOption(payload.flightOptions)
  const defaultTransport = getDefaultOption(payload.transportOptions)
  const dateRange = formatDateRange(payload)
  const lines: string[] = []

  lines.push(`****${payload.title}****`)
  lines.push(formatPassengerSummary(payload))
  if (dateRange) lines.push(dateRange)
  if (packageUrl) lines.push(`Package URL: ${packageUrl}`)
  lines.push('')

  if (defaultFlight) {
    lines.push('****Flight Included****')
    lines.push(...formatFlightIncludedLines(defaultFlight))
    const linkedFlightGroups = getLinkedFlightGroupsForFlight(payload, defaultFlight)
    linkedFlightGroups.forEach((group) => {
      const includedOption = getLinkedFlightOptionForSelection(group, null)
      if (!includedOption) return
      lines.push('')
      lines.push(...formatLinkedFlightIncludedLines(group, includedOption))
    })
    lines.push('')
  }

  const alternativeFlightLines: string[] = []
  if (defaultFlight) {
    const flightAlternatives = payload.flightOptions.filter(
      (option) => option.id !== defaultFlight.id,
    )
    flightAlternatives.forEach((option) => {
      const optionNumber = alternativeFlightLines.filter((line) =>
        line.startsWith('*Option '),
      ).length
      const delta = getFlightOptionPriceDeltas(payload, option, defaultFlight).adult
      alternativeFlightLines.push('')
      alternativeFlightLines.push(
        ...formatAlternativeFlightLines(
          `*Option ${optionNumber + 1} - Main Flight*`,
          `*Airline:* ${option.title || 'Alternative flight'}${
            option.summary.trim() ? `\n${option.summary.trim()}` : ''
          }`,
          delta,
          payload.currency,
        ),
      )
    })
    getLinkedFlightGroupsForFlight(payload, defaultFlight).forEach((group) => {
      const defaultLinkedOption = getLinkedFlightOptionForSelection(group, null)
      group.options
        .filter((option) => option.id !== defaultLinkedOption?.id)
        .forEach((option) => {
          const optionNumber = alternativeFlightLines.filter((line) =>
            line.startsWith('*Option '),
          ).length
          alternativeFlightLines.push('')
          alternativeFlightLines.push(
            ...formatAlternativeFlightLines(
              `*Option ${optionNumber + 1} - Linked Flight ${group.routeLabel || group.id}*`,
              `*Airline:* ${option.airlineName || 'Alternative airline'}${
                option.summary.trim() ? `\n${option.summary.trim()}` : ''
              }`,
              option.adultDelta - (defaultLinkedOption?.adultDelta || 0),
              payload.currency,
            ),
          )
        })
    })
  }
  if (alternativeFlightLines.length > 0) {
    lines.push('****Alternative Flights****')
    lines.push(...alternativeFlightLines)
    lines.push('')
  }

  if (payload.visaOptions.length > 0) {
    lines.push('****Visa Included****')
    payload.visaOptions.forEach((option) => {
      lines.push(formatVisaLine(option, payload))
    })
    lines.push('')
  }

  if (defaultTransport) {
    lines.push('****Transport Included****')
    lines.push(...formatTransportLines(defaultTransport))
    getLinkedTransportNotes(payload).forEach((note) => {
      lines.push(`* ${note}`)
    })
    const transportAlternatives = payload.transportOptions.filter(
      (option) => option.id !== defaultTransport.id,
    )
    for (const option of transportAlternatives) {
      const servicePassengers = getServicePassengerCount(payload)
      const delta =
        servicePassengers > 0
          ? (option.price - defaultTransport.price) / servicePassengers
          : option.price - defaultTransport.price
      lines.push(`- ${option.title}: ${formatDelta(delta, payload.currency)} p.p.`)
    }
    lines.push('')
  }

  lines.push('----------------------------')
  lines.push('****Package Options****')

  customerOptions.slice(0, limit).forEach(({ combination }, index) => {
    lines.push('')
    lines.push(`*Option ${index + 1}*`)
    lines.push('')
    for (const stay of getOrderedStaySelections(payload, combination)) {
      lines.push(`*${stay.groupLabel}*`)
      lines.push(stay.option.summary || stay.option.title)
      lines.push('')
    }
    const breakdown = getPackagePassengerPriceBreakdown(payload, combination)
    lines.push(`Adult 12+: ${formatMoney(breakdown.adult, breakdown.currency)} p.p.`)
    if (payload.childrenPaying > 0) {
      lines.push(`Child 5+: ${formatMoney(breakdown.child, breakdown.currency)} p.p.`)
    }
    if (payload.childrenFree > 0) {
      lines.push(`Child 2-4: ${formatMoney(breakdown.childTwoToFour, breakdown.currency)} p.p.`)
    }
    if (payload.infants > 0) {
      lines.push(`Infant 0-2: ${formatMoney(breakdown.infant, breakdown.currency)} p.p.`)
    }
    if (index === 0 && payload.depositRequired && (payload.depositAmount || 0) > 0) {
      lines.push(
        `Deposit required to secure: ${formatMoney(payload.depositAmount || 0, payload.currency)}`,
      )
    }
  })

  lines.push('')
  lines.push('--------')

  if (payload.limitedTimeOffers.length > 0) {
    lines.push('')
    for (const offer of payload.limitedTimeOffers) {
      lines.push(`****${offer.title.toUpperCase()}****`)
      if (offer.summary.trim()) lines.push(offer.summary)
      if (offer.expiresAt) lines.push(`Valid until ${formatOfferDeadline(offer.expiresAt)}`)
    }
  }

  lines.push('')
  lines.push('****Terms & Conditions****')
  lines.push('Terms and conditions apply and can be found at:')
  lines.push('https://www.piyamtravel.com/terms-and-conditions')
  lines.push('Offer is valid subject to availability.')

  return lines.join('\n').trim()
}

export function resolvePackageSelection(
  payloadInput: unknown,
  input: PackageSelectionInput,
): PackageResolvedSelection {
  const payload = normalizePackageQuotePayload(payloadInput)
  const payingGuests = getPayingGuestCount(payload)
  const servicePassengers = getServicePassengerCount(payload)
  const paymentIntent = normalizePaymentIntent(input.paymentIntent)
  const requestedPaymentMethod = normalizePaymentMethod(input.paymentMethod)
  const paymentMethod = paymentIntent === 'full_payment' ? requestedPaymentMethod : 'bank_transfer'
  const depositPaymentMethod =
    paymentIntent === 'deposit_only'
      ? normalizePaymentMethod(input.depositPaymentMethod || input.paymentMethod)
      : null

  if (payingGuests <= 0) {
    throw new Error('At least one paying guest is required')
  }

  const staySelections = payload.stayGroups.map((group) => {
    const selectedId = input.stayOptionIds?.[group.id]
    const option = group.options.find((candidate) => candidate.id === selectedId)
    if (!option) throw new Error(`Select a valid ${group.label} option`)
    return {
      groupId: group.id,
      groupLabel: group.label,
      option,
    }
  })

  const flightOption =
    input.flightOptionId && payload.flightOptions.length > 0
      ? payload.flightOptions.find((option) => option.id === input.flightOptionId) || null
      : null

  if (input.flightOptionId && payload.flightOptions.length > 0 && !flightOption) {
    throw new Error('Select a valid flight option')
  }

  const linkedFlightSelections = getLinkedFlightSelections(
    payload,
    flightOption,
    input.linkedFlightOptionIds,
  )
  const validLinkedFlightGroupIds = new Set(
    getLinkedFlightGroupsForFlight(payload, flightOption).map((group) => group.id),
  )
  const selectedLinkedFlightOptionIds = Object.entries(input.linkedFlightOptionIds || {})
    .filter(([groupId]) => validLinkedFlightGroupIds.has(groupId))
    .reduce<Record<string, string>>((selected, [groupId, optionId]) => {
      selected[groupId] = optionId
      return selected
    }, {})

  for (const [groupId, optionId] of Object.entries(selectedLinkedFlightOptionIds)) {
    const group = payload.linkedFlightGroups.find((candidate) => candidate.id === groupId)
    if (group && !group.options.some((option) => option.id === optionId)) {
      throw new Error('Select a valid linked flight option')
    }
  }

  const visaOption =
    input.visaOptionId && payload.visaOptions.length > 0
      ? payload.visaOptions.find((option) => option.id === input.visaOptionId) || null
      : payload.visaOptions[0] || null

  if (input.visaOptionId && payload.visaOptions.length > 0 && !visaOption) {
    throw new Error('Select a valid visa option')
  }

  const transportOption =
    input.transportOptionId && payload.transportOptions.length > 0
      ? payload.transportOptions.find((option) => option.id === input.transportOptionId) || null
      : null

  if (input.transportOptionId && payload.transportOptions.length > 0 && !transportOption) {
    throw new Error('Select a valid transport option')
  }

  const grossPrice =
    staySelections.reduce((sum, stay) => sum + stay.option.price, 0) +
    getFlightOptionTotal(flightOption, payload) +
    getLinkedFlightSelectionsTotal(payload, linkedFlightSelections) +
    getVisaOptionsTotal(payload.visaOptions, payload) +
    getOptionTotal(transportOption, servicePassengers)
  const activeOffers = getActiveOffers(payload)
  const offerDiscountTotal = activeOffers.reduce(
    (sum, offer) => sum + getOfferDiscountTotal(offer, payingGuests),
    0,
  )
  const packageSubtotalPrice = Math.max(0, grossPrice - offerDiscountTotal)
  const paymentBreakdown = normalizePackagePaymentBreakdown(
    input.paymentBreakdown,
    packageSubtotalPrice,
    paymentMethod,
  )
  const paymentSurchargeTotal = getPaymentSurchargeFromBreakdown(payload, paymentBreakdown)
  const totalPrice = packageSubtotalPrice + paymentSurchargeTotal

  return {
    selection: {
      stayOptionIds: input.stayOptionIds || {},
      flightOptionId: input.flightOptionId || null,
      linkedFlightOptionIds: selectedLinkedFlightOptionIds,
      visaOptionId: input.visaOptionId || null,
      transportOptionId: input.transportOptionId || null,
      paymentMethod,
      paymentBreakdown,
      paymentIntent,
      installmentRequested: Boolean(
        input.installmentRequested || paymentIntent === 'installment_request',
      ),
      depositPaymentMethod,
      termsAccepted: Boolean(input.termsAccepted),
      customerName: asString(input.customerName),
      customerPhone: asString(input.customerPhone),
      customerEmail: asString(input.customerEmail),
      note: asString(input.note),
    },
    combination: {
      id: [
        ...staySelections.map((stay) => stay.option.id),
        flightOption?.id || 'no-flight',
        linkedFlightSelections.length > 0
          ? linkedFlightSelections
              .map((selection) => `${selection.group.id}:${selection.option.id}`)
              .join('|')
          : 'no-linked-flight',
        payload.visaOptions.length > 0
          ? payload.visaOptions
              .map((option) => `${option.id}:${option.quantity || 'all'}`)
              .join('|')
          : 'no-visa',
        transportOption?.id || 'no-transport',
        paymentMethod,
        paymentBreakdown.cash,
        paymentBreakdown.bankTransfer,
        paymentBreakdown.card,
      ].join('__'),
      staySelections,
      flightOption,
      linkedFlightSelections,
      visaOption,
      visaOptions: payload.visaOptions,
      transportOption,
      packageSubtotalPrice,
      paymentMethod,
      paymentBreakdown,
      paymentSurchargeTotal,
      totalPrice,
      grossPrice,
      offerDiscountTotal,
      perPersonPrice: totalPrice / payingGuests,
      payingGuests,
      servicePassengers,
      currency: payload.currency,
      appliedOffers: activeOffers,
    },
  }
}
