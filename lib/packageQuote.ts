import type {
  PackageCombination,
  PackageComponentOption,
  PackageQuotePayload,
  PackageResolvedSelection,
  PackageSelectionInput,
  PackageStayGroup,
  TravelPackageType,
} from '@/app/types/packages'

const VALID_PACKAGE_TYPES = new Set<TravelPackageType>(['umrah', 'ziyarat', 'holiday'])

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

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, parsed)
}

function asInteger(value: unknown, fallback = 0) {
  return Math.floor(asNumber(value, fallback))
}

function normalizePackageType(value: unknown): TravelPackageType {
  return VALID_PACKAGE_TYPES.has(value as TravelPackageType) ? (value as TravelPackageType) : 'umrah'
}

function normalizeCurrency(value: unknown) {
  const currency = asString(value, DEFAULT_PACKAGE_CURRENCY).toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : DEFAULT_PACKAGE_CURRENCY
}

function normalizeOption(raw: unknown, fallbackId: string): PackageComponentOption | null {
  const candidate = raw as Partial<PackageComponentOption> | null
  const title = asString(candidate?.title)
  const summary = asString(candidate?.summary)
  const price = asNumber(candidate?.price)
  const id = asString(candidate?.id, fallbackId)

  if (!title && !summary && price <= 0) return null

  return {
    id,
    title: title || summary.split('\n')[0] || 'Option',
    summary,
    price,
  }
}

function normalizeOptions(raw: unknown, prefix: string) {
  const values = Array.isArray(raw) ? raw : []
  return values
    .map((value, index) => normalizeOption(value, `${prefix}-${index + 1}`))
    .filter((value): value is PackageComponentOption => Boolean(value))
}

function normalizeStayGroups(raw: unknown): PackageStayGroup[] {
  const values = Array.isArray(raw) && raw.length > 0 ? raw : []
  const groups = values.map((value, index) => {
    const candidate = value as Partial<PackageStayGroup> | null
    const id = asString(candidate?.id, index === 0 ? 'makkah' : index === 1 ? 'madinah' : `stay-${index + 1}`)
    return {
      id,
      label: asString(candidate?.label, index === 0 ? 'Makkah' : index === 1 ? 'Madinah' : `Stay ${index + 1}`),
      options: normalizeOptions(candidate?.options, `${id}-hotel`),
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
    flightOptions: normalizeOptions(candidate.flightOptions, 'flight'),
    transportOptions: normalizeOptions(candidate.transportOptions, 'transport'),
    notes: asString(candidate.notes),
  }
}

export function getPayingGuestCount(payload: Pick<PackageQuotePayload, 'adults' | 'childrenPaying'>) {
  return Math.max(0, payload.adults + payload.childrenPaying)
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
  if (payingGuests <= 0) return []

  const staySelections = buildStaySelections(payload.stayGroups)
  if (staySelections.length === 0) return []

  const flightOptions: Array<PackageComponentOption | null> =
    payload.flightOptions.length > 0 ? payload.flightOptions : [null]
  const transportOptions: Array<PackageComponentOption | null> =
    payload.transportOptions.length > 0 ? payload.transportOptions : [null]

  const combinations: PackageCombination[] = []

  for (const stays of staySelections) {
    for (const flightOption of flightOptions) {
      for (const transportOption of transportOptions) {
        const totalPrice =
          stays.reduce((sum, stay) => sum + stay.option.price, 0) +
          (flightOption?.price || 0) +
          (transportOption?.price || 0)

        combinations.push({
          id: [
            ...stays.map((stay) => stay.option.id),
            flightOption?.id || 'no-flight',
            transportOption?.id || 'no-transport',
          ].join('__'),
          staySelections: stays,
          flightOption,
          transportOption,
          totalPrice,
          perPersonPrice: totalPrice / payingGuests,
          payingGuests,
          currency: payload.currency,
        })
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

  for (const stay of getOrderedStaySelections(payload, combination)) {
    lines.push(`*(${stay.groupLabel})*`)
    lines.push(stay.option.summary || stay.option.title)
    lines.push('')
  }

  if (combination.flightOption) {
    lines.push('*Flight*')
    lines.push(combination.flightOption.summary || combination.flightOption.title)
    lines.push('')
  }

  if (combination.transportOption) {
    lines.push('*Transport*')
    lines.push(combination.transportOption.summary || combination.transportOption.title)
    lines.push('')
  }

  lines.push(`*Per Person Price: ${formatMoney(combination.perPersonPrice, combination.currency)}*`)
  lines.push(`*Total Package Cost: ${formatMoney(combination.totalPrice, combination.currency)}*`)

  return lines.join('\n').trim()
}

export function resolvePackageSelection(
  payloadInput: unknown,
  input: PackageSelectionInput,
): PackageResolvedSelection {
  const payload = normalizePackageQuotePayload(payloadInput)
  const payingGuests = getPayingGuestCount(payload)

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

  const transportOption =
    input.transportOptionId && payload.transportOptions.length > 0
      ? payload.transportOptions.find((option) => option.id === input.transportOptionId) || null
      : null

  if (input.transportOptionId && payload.transportOptions.length > 0 && !transportOption) {
    throw new Error('Select a valid transport option')
  }

  const totalPrice =
    staySelections.reduce((sum, stay) => sum + stay.option.price, 0) +
    (flightOption?.price || 0) +
    (transportOption?.price || 0)

  return {
    selection: {
      stayOptionIds: input.stayOptionIds || {},
      flightOptionId: input.flightOptionId || null,
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
        transportOption?.id || 'no-transport',
      ].join('__'),
      staySelections,
      flightOption,
      transportOption,
      totalPrice,
      perPersonPrice: totalPrice / payingGuests,
      payingGuests,
      currency: payload.currency,
    },
  }
}
