import type {
  TicketingAirportOption,
  TicketingItineraryResponse,
  TicketingReplaceItineraryInput,
} from '@/lib/ticketing/itineraryContracts'

type ApiErrorPayload = {
  error?: string
  code?: string
  fieldErrors?: Record<string, string>
}

export class TicketItineraryApiError extends Error {
  code?: string
  fieldErrors: Record<string, string>

  constructor(message: string, code?: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.name = 'TicketItineraryApiError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

type TicketAirportLookup = {
  query?: string
  codes?: string[]
  limit?: number
}

const AIRPORT_LOOKUP_CACHE_LIMIT = 100
const airportLookupCache = new Map<string, TicketingAirportOption[]>()

function rememberAirportLookup(key: string, items: TicketingAirportOption[]) {
  if (airportLookupCache.size >= AIRPORT_LOOKUP_CACHE_LIMIT) {
    const oldestKey = airportLookupCache.keys().next().value
    if (oldestKey) airportLookupCache.delete(oldestKey)
  }
  airportLookupCache.set(key, items)
}

export async function loadTicketItinerary(
  bookingId: string,
  signal?: AbortSignal,
): Promise<TicketingItineraryResponse> {
  const response = await fetch(`/api/ticketing/bookings/${encodeURIComponent(bookingId)}/sectors`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as Partial<TicketingItineraryResponse> &
    ApiErrorPayload

  if (!response.ok) {
    throw new TicketItineraryApiError(
      payload.error || 'Unable to load this itinerary',
      payload.code,
      payload.fieldErrors,
    )
  }

  if (
    !payload.booking ||
    !payload.context ||
    !Array.isArray(payload.sectors) ||
    !Number.isInteger(payload.itineraryVersion) ||
    typeof payload.context.isOnBehalf !== 'boolean' ||
    typeof payload.context.onBehalfReasonRequired !== 'boolean'
  ) {
    throw new TicketItineraryApiError('Itinerary details returned an invalid result. Try again.')
  }

  return payload as TicketingItineraryResponse
}

export async function loadTicketAirports(
  lookup: TicketAirportLookup,
  signal?: AbortSignal,
): Promise<TicketingAirportOption[]> {
  const query = lookup.query?.trim()
  const codes = [
    ...new Set((lookup.codes || []).map((code) => code.trim().toUpperCase()).filter(Boolean)),
  ]
  if (!query && codes.length === 0) return []
  if (query && codes.length > 0) {
    throw new TicketItineraryApiError('Search by text or airport codes, not both.')
  }

  const parameters = new URLSearchParams()
  if (query) parameters.set('q', query)
  if (codes.length > 0) parameters.set('codes', codes.join(','))
  parameters.set('limit', String(lookup.limit || (codes.length > 0 ? codes.length : 20)))
  const requestUrl = `/api/ticketing/airports?${parameters.toString()}`
  const cached = airportLookupCache.get(requestUrl)
  if (cached) return cached

  const response = await fetch(requestUrl, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    items?: TicketingAirportOption[]
  } & ApiErrorPayload

  if (!response.ok) {
    throw new TicketItineraryApiError(payload.error || 'Unable to load the airport directory')
  }
  if (!Array.isArray(payload.items)) {
    throw new TicketItineraryApiError('Airport lookup returned an invalid result. Try again.')
  }
  rememberAirportLookup(requestUrl, payload.items)
  return payload.items
}

export async function replaceTicketItinerary(
  bookingId: string,
  input: TicketingReplaceItineraryInput,
): Promise<TicketingItineraryResponse> {
  const response = await fetch(`/api/ticketing/bookings/${encodeURIComponent(bookingId)}/sectors`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const payload = (await response.json().catch(() => ({}))) as Partial<TicketingItineraryResponse> &
    ApiErrorPayload

  if (!response.ok) {
    throw new TicketItineraryApiError(
      payload.error || 'Unable to save this itinerary',
      payload.code,
      payload.fieldErrors,
    )
  }
  if (!payload.booking || !payload.context || !Array.isArray(payload.sectors)) {
    throw new TicketItineraryApiError('The saved itinerary returned an invalid result. Refresh it.')
  }

  return payload as TicketingItineraryResponse
}
