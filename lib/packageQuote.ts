import type {
  PackageCombination,
  PackageComponentOption,
  PackageDiscountMode,
  PackageLimitedTimeOffer,
  PackagePassengerPriceBreakdown,
  PackagePricingMode,
  PackageQuotePayload,
  PackageResolvedSelection,
  PackageSelectionInput,
  PackageStayGroup,
  TravelPackageQuote,
  TravelPackageType,
} from '@/app/types/packages'

const VALID_PACKAGE_TYPES = new Set<TravelPackageType>(['umrah', 'ziyarat', 'holiday'])
const VALID_PRICING_MODES = new Set<PackagePricingMode>(['total', 'per_person'])
const VALID_DISCOUNT_MODES = new Set<PackageDiscountMode>(['total', 'per_person'])

export const DEFAULT_PACKAGE_CURRENCY = 'GBP'
export const DEFAULT_PACKAGE_EXPIRY_HOURS = 72

export function getDefaultPackageExpiry(hours = DEFAULT_PACKAGE_EXPIRY_HOURS) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
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

function normalizePackageType(value: unknown): TravelPackageType {
  return VALID_PACKAGE_TYPES.has(value as TravelPackageType) ? (value as TravelPackageType) : 'umrah'
}

function normalizeCurrency(value: unknown) {
  const currency = asString(value, DEFAULT_PACKAGE_CURRENCY).toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_PACKAGE_CURRENCY
}

function normalizePricingMode(value: unknown, fallback: PackagePricingMode): PackagePricingMode {
  return VALID_PRICING_MODES.has(value as PackagePricingMode) ? (value as PackagePricingMode) : fallback
}

function normalizeDiscountMode(value: unknown, fallback: PackageDiscountMode): PackageDiscountMode {
  return VALID_DISCOUNT_MODES.has(value as PackageDiscountMode) ? (value as PackageDiscountMode) : fallback
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

  if (!title && !summaryText && price <= 0 && adultPrice <= 0 && childPrice <= 0 && infantPrice <= 0) {
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
    const id = asString(candidate?.id, index === 0 ? 'makkah' : index === 1 ? 'madinah' : `stay-${index + 1}`)
    return {
      id,
      label: asString(candidate?.label, index === 0 ? 'Makkah' : index === 1 ? 'Madinah' : `Stay ${index + 1}`),
      options: normalizeOptions(candidate?.options, `${id}-hotel`, 'total'),
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

  const flightOptions = normalizeDefaultOption(normalizeOptions(candidate.flightOptions, 'flight', 'per_person'))

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
    itineraryOrder: itineraryOrder.length > 0 ? itineraryOrder : stayGroups.map((group) => group.id),
    departureDate: asString(candidate.departureDate),
    returnDate: asString(candidate.returnDate),
    stayGroups,
    flightOptions,
    visaOptions: normalizeOptions(candidate.visaOptions, 'visa', 'per_person'),
    transportOptions: normalizeOptions(candidate.transportOptions, 'transport', 'total'),
    limitedTimeOffers: normalizeOffers(candidate.limitedTimeOffers),
    notes: asText(candidate.notes),
  }
}

export function getPayingGuestCount(payload: Pick<PackageQuotePayload, 'adults' | 'childrenPaying'>) {
  return Math.max(0, payload.adults + payload.childrenPaying)
}

export function getServicePassengerCount(
  payload: Pick<PackageQuotePayload, 'adults' | 'childrenPaying' | 'childrenFree'>,
) {
  return Math.max(0, payload.adults + payload.childrenPaying + payload.childrenFree)
}

export function buildPassengerSummary(payloadInput: unknown) {
  const payload = normalizePackageQuotePayload(payloadInput)
  const hotelPayingGuests = getPayingGuestCount(payload)
  const servicePassengers = getServicePassengerCount(payload)

  return {
    adults: payload.adults,
    childrenPaying: payload.childrenPaying,
    childrenFree: payload.childrenFree,
    totalPassengers: servicePassengers,
    hotelPayingGuests,
    servicePassengers,
  }
}

export function getDefaultPackageNextAction(selection: PackageResolvedSelection | null | undefined) {
  if (!selection) return 'Finalise customer package option'
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
  return Boolean((option.adultPrice || 0) > 0 || (option.childPrice || 0) > 0 || (option.infantPrice || 0) > 0)
}

function getOptionTotal(option: PackageComponentOption | null, passengerCount: number) {
  if (!option) return 0
  return option.price * (option.pricingMode === 'per_person' ? passengerCount : 1)
}

function getFlightOptionTotal(option: PackageComponentOption | null, payload: PackageQuotePayload) {
  if (!option) return 0
  if (!hasTieredFlightPricing(option)) {
    return getOptionTotal(option, getServicePassengerCount(payload))
  }

  return (
    (option.adultPrice || 0) * payload.adults
    + (option.childPrice || 0) * payload.childrenPaying
    + (option.infantPrice || 0) * payload.childrenFree
  )
}

function getDefaultOption<T extends PackageComponentOption>(options: T[]) {
  return options.find((option) => option.isDefault) || options[0] || null
}

function getCheapestOption<T extends PackageComponentOption>(options: T[]) {
  if (options.length === 0) return null
  return [...options].sort((a, b) => a.price - b.price)[0]
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
  const visaOptions: Array<PackageComponentOption | null> =
    payload.visaOptions.length > 0 ? payload.visaOptions : [null]
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
      for (const visaOption of visaOptions) {
        for (const transportOption of transportOptions) {
          const grossPrice =
            stays.reduce((sum, stay) => sum + stay.option.price, 0) +
            getFlightOptionTotal(flightOption, payload) +
            getOptionTotal(visaOption, servicePassengers) +
            getOptionTotal(transportOption, servicePassengers)
          const totalPrice = Math.max(0, grossPrice - offerDiscountTotal)

          combinations.push({
            id: [
              ...stays.map((stay) => stay.option.id),
              flightOption?.id || 'no-flight',
              visaOption?.id || 'no-visa',
              transportOption?.id || 'no-transport',
            ].join('__'),
            staySelections: stays,
            flightOption,
            visaOption,
            transportOption,
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
  }

  return combinations.sort((a, b) => a.totalPrice - b.totalPrice).slice(0, limit)
}

function getOrderedStaySelections(payload: PackageQuotePayload, combination: PackageCombination) {
  const order = payload.itineraryOrder.length > 0 ? payload.itineraryOrder : payload.stayGroups.map((group) => group.id)
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
      ? `${payload.childrenPaying} Child${payload.childrenPaying === 1 ? '' : 'ren'} 5-12`
      : '',
    payload.childrenFree ? `${payload.childrenFree} Under 5` : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(', ') : 'Passengers not set'
}

function formatDateRange(payload: PackageQuotePayload) {
  if (!payload.departureDate && !payload.returnDate) return ''
  return [payload.departureDate, payload.returnDate].filter(Boolean).join(' to ')
}

export function getDefaultPackageSelection(payloadInput: unknown): PackageSelectionInput {
  const payload = normalizePackageQuotePayload(payloadInput)
  return {
    stayOptionIds: Object.fromEntries(
      payload.stayGroups.map((group) => [group.id, getCheapestOption(group.options)?.id || '']),
    ),
    flightOptionId: getDefaultOption(payload.flightOptions)?.id || null,
    visaOptionId: payload.visaOptions[0]?.id || null,
    transportOptionId: payload.transportOptions[0]?.id || null,
  }
}

export function resolveDefaultPackageSelection(payloadInput: unknown): PackageResolvedSelection | null {
  try {
    return resolvePackageSelection(payloadInput, getDefaultPackageSelection(payloadInput))
  } catch {
    return null
  }
}

export function buildCustomerPackageOptions(payloadInput: unknown, limit = 80): PackageResolvedSelection[] {
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
    .sort((a, b) => a.combination.totalPrice - b.combination.totalPrice)
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
  const base = getFlightPassengerUnitPrices(baseOption || getDefaultOption(payload.flightOptions), payload)
  const next = getFlightPassengerUnitPrices(option, payload)
  return {
    adult: next.adult - base.adult,
    child: next.child - base.child,
    infant: next.infant - base.infant,
  }
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
  const visaUnit = getComponentPassengerUnitPrice(combination.visaOption, servicePassengers)
  const transportUnit = getComponentPassengerUnitPrice(combination.transportOption, servicePassengers)
  const discountUnit = payingGuests > 0 ? combination.offerDiscountTotal / payingGuests : 0

  const adult = Math.max(0, hotelUnit + flightUnits.adult + visaUnit + transportUnit - discountUnit)
  const child = Math.max(0, hotelUnit + flightUnits.child + visaUnit + transportUnit - discountUnit)
  const infant = Math.max(0, flightUnits.infant + visaUnit + transportUnit)

  return {
    adult,
    child,
    infant,
    adultTotal: adult * payload.adults,
    childTotal: child * payload.childrenPaying,
    infantTotal: infant * payload.childrenFree,
    total: adult * payload.adults + child * payload.childrenPaying + infant * payload.childrenFree,
    currency: combination.currency,
  }
}

function formatDelta(value: number, currency: string) {
  if (Math.abs(value) < 0.005) return 'Included'
  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)}`
}

function getCombinationDelta(combination: PackageCombination, baseTotal: number) {
  return combination.totalPrice - baseTotal
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
    lines.push('')
  }

  if (combination.visaOption) {
    lines.push('****Visa****')
    lines.push(combination.visaOption.summary || combination.visaOption.title)
    lines.push('')
  }

  if (combination.transportOption) {
    lines.push('****Transport****')
    lines.push(combination.transportOption.summary || combination.transportOption.title)
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
    lines.push(`*Discount Applied: -${formatMoney(combination.offerDiscountTotal, combination.currency)}*`)
  }
  lines.push(`*Per Person Price: ${formatMoney(combination.perPersonPrice, combination.currency)}*`)
  lines.push(`*Total Package Cost: ${formatMoney(combination.totalPrice, combination.currency)}*`)

  return lines.join('\n').trim()
}

export function formatPackageQuoteForCopy(payloadInput: unknown, limit = 12) {
  const payload = normalizePackageQuotePayload(payloadInput)
  const customerOptions = buildCustomerPackageOptions(payload, 250)
  const baseTotal = customerOptions[0]?.combination.totalPrice ?? 0
  const defaultFlight = getDefaultOption(payload.flightOptions)
  const defaultVisa = payload.visaOptions[0] || null
  const defaultTransport = payload.transportOptions[0] || null
  const dateRange = formatDateRange(payload)
  const lines: string[] = []

  lines.push(`****${payload.title}****`)
  lines.push(formatPassengerSummary(payload))
  if (dateRange) lines.push(dateRange)
  lines.push('')

  if (defaultFlight) {
    lines.push('****Flight Included****')
    lines.push(defaultFlight.summary || defaultFlight.title)
    const flightAlternatives = payload.flightOptions.filter((option) => option.id !== defaultFlight.id)
    for (const option of flightAlternatives) {
      const deltas = getFlightOptionPriceDeltas(payload, option, defaultFlight)
      const deltaParts = [
        `Adult ${formatDelta(deltas.adult, payload.currency)}`,
        `Child ${formatDelta(deltas.child, payload.currency)}`,
        `Under 5 ${formatDelta(deltas.infant, payload.currency)}`,
      ]
      lines.push(`- ${option.title}: ${deltaParts.join(' / ')}`)
    }
    lines.push('')
  }

  if (defaultVisa) {
    lines.push('****Visa Included****')
    lines.push(defaultVisa.summary || defaultVisa.title)
    lines.push('')
  }

  if (defaultTransport) {
    lines.push('****Transport Included****')
    lines.push(defaultTransport.summary || defaultTransport.title)
    lines.push('')
  }

  lines.push('----------------------------')
  lines.push('****Package Options****')

  customerOptions.slice(0, limit).forEach(({ combination }, index) => {
    const delta = getCombinationDelta(combination, baseTotal)
    const label = index === 0 ? 'Included' : formatDelta(delta, combination.currency)
    lines.push('')
    lines.push(`*Option ${index + 1}: ${label}*`)
    for (const stay of getOrderedStaySelections(payload, combination)) {
      lines.push(`*${stay.groupLabel}*`)
      lines.push(stay.option.summary || stay.option.title)
    }
    if (index === 0) {
      const breakdown = getPackagePassengerPriceBreakdown(payload, combination)
      lines.push(`Adult: ${formatMoney(breakdown.adult, breakdown.currency)} p.p.`)
      if (payload.childrenPaying > 0) {
        lines.push(`Child 5+: ${formatMoney(breakdown.child, breakdown.currency)} p.p.`)
      }
      if (payload.childrenFree > 0) {
        lines.push(`Child under 5: ${formatMoney(breakdown.infant, breakdown.currency)} p.p.`)
      }
      lines.push(`Base total: ${formatMoney(combination.totalPrice, combination.currency)}`)
    }
  })

  if (payload.limitedTimeOffers.length > 0) {
    lines.push('')
    for (const offer of payload.limitedTimeOffers) {
      lines.push(`****${offer.title.toUpperCase()}****`)
      if (offer.summary.trim()) lines.push(offer.summary)
      if (offer.expiresAt) lines.push(`Valid until ${formatOfferDeadline(offer.expiresAt)}`)
    }
  }

  return lines.join('\n').trim()
}

export function resolvePackageSelection(
  payloadInput: unknown,
  input: PackageSelectionInput,
): PackageResolvedSelection {
  const payload = normalizePackageQuotePayload(payloadInput)
  const payingGuests = getPayingGuestCount(payload)
  const servicePassengers = getServicePassengerCount(payload)

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

  const visaOption =
    input.visaOptionId && payload.visaOptions.length > 0
      ? payload.visaOptions.find((option) => option.id === input.visaOptionId) || null
      : null

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
    getOptionTotal(visaOption, servicePassengers) +
    getOptionTotal(transportOption, servicePassengers)
  const activeOffers = getActiveOffers(payload)
  const offerDiscountTotal = activeOffers.reduce(
    (sum, offer) => sum + getOfferDiscountTotal(offer, payingGuests),
    0,
  )
  const discountedTotalPrice = Math.max(0, grossPrice - offerDiscountTotal)

  return {
    selection: {
      stayOptionIds: input.stayOptionIds || {},
      flightOptionId: input.flightOptionId || null,
      visaOptionId: input.visaOptionId || null,
      transportOptionId: input.transportOptionId || null,
      customerName: asString(input.customerName),
      customerPhone: asString(input.customerPhone),
      customerEmail: asString(input.customerEmail),
      note: asString(input.note),
    },
    combination: {
      id: [
        ...staySelections.map((stay) => stay.option.id),
        flightOption?.id || 'no-flight',
        visaOption?.id || 'no-visa',
        transportOption?.id || 'no-transport',
      ].join('__'),
      staySelections,
      flightOption,
      visaOption,
      transportOption,
      totalPrice: discountedTotalPrice,
      grossPrice,
      offerDiscountTotal,
      perPersonPrice: discountedTotalPrice / payingGuests,
      payingGuests,
      servicePassengers,
      currency: payload.currency,
      appliedOffers: activeOffers,
    },
  }
}
