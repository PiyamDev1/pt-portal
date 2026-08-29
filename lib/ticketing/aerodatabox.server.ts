type AeroDataBoxTime = { local?: unknown; utc?: unknown }
type AeroDataBoxAirport = { iata?: unknown; icao?: unknown; name?: unknown }
type AeroDataBoxMovement = {
  airport?: AeroDataBoxAirport
  scheduledTime?: AeroDataBoxTime
  revisedTime?: AeroDataBoxTime
  predictedTime?: AeroDataBoxTime
}
type AeroDataBoxFlight = {
  status?: unknown
  number?: unknown
  departure?: AeroDataBoxMovement
  arrival?: AeroDataBoxMovement
}

export type ProviderFlightSchedule = {
  flightNumber: string
  status: string | null
  originIata: string | null
  destinationIata: string | null
  departureLocal: string | null
  arrivalLocal: string | null
}

export type AeroDataBoxResult =
  | { ok: true; httpStatus: number; endpoint: string; schedules: ProviderFlightSchedule[] }
  | { ok: false; httpStatus: number | null; endpoint: string; error: string }

function localMinute(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(' ', 'T')
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
  return match?.[1] || null
}

function code(value: unknown) {
  return typeof value === 'string' && /^[A-Z]{3}$/.test(value.trim().toUpperCase())
    ? value.trim().toUpperCase()
    : null
}

function schedule(value: unknown): ProviderFlightSchedule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const flight = value as AeroDataBoxFlight
  const flightNumber = typeof flight.number === 'string' ? flight.number.trim().toUpperCase() : ''
  if (!flightNumber) return null
  return {
    flightNumber,
    status: typeof flight.status === 'string' ? flight.status.trim() : null,
    originIata: code(flight.departure?.airport?.iata),
    destinationIata: code(flight.arrival?.airport?.iata),
    departureLocal: localMinute(
      flight.departure?.revisedTime?.local ||
        flight.departure?.predictedTime?.local ||
        flight.departure?.scheduledTime?.local,
    ),
    arrivalLocal: localMinute(
      flight.arrival?.revisedTime?.local ||
        flight.arrival?.predictedTime?.local ||
        flight.arrival?.scheduledTime?.local,
    ),
  }
}

function configuration() {
  const key = process.env.AERODATABOX_API_KEY?.trim()
  const baseUrl = (
    process.env.AERODATABOX_API_BASE_URL?.trim() || 'https://aerodatabox.p.rapidapi.com'
  ).replace(/\/$/, '')
  const host = process.env.AERODATABOX_API_HOST?.trim() || new URL(baseUrl).host
  return { key, baseUrl, host }
}

export function isAeroDataBoxConfigured() {
  return Boolean(configuration().key)
}

export async function fetchAeroDataBoxFlight(input: {
  flightNumber: string
  departureDate: string
}): Promise<AeroDataBoxResult> {
  const config = configuration()
  const endpointPath = `/flights/number/${encodeURIComponent(input.flightNumber)}/${encodeURIComponent(input.departureDate)}`
  const endpoint = `${endpointPath}?withAircraftImage=false&withLocation=false`
  if (!config.key) return { ok: false, httpStatus: null, endpoint, error: 'API key is missing' }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (config.baseUrl.includes('rapidapi.com')) {
    headers['X-RapidAPI-Key'] = config.key
    headers['X-RapidAPI-Host'] = config.host
  } else {
    headers['X-Api-Key'] = config.key
  }

  try {
    const response = await fetch(`${config.baseUrl}${endpoint}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) {
      return {
        ok: false,
        httpStatus: response.status,
        endpoint,
        error:
          response.status === 404
            ? 'Flight not found'
            : `Provider returned HTTP ${response.status}`,
      }
    }
    const payload = (await response.json()) as unknown
    const values = Array.isArray(payload) ? payload : []
    return {
      ok: true,
      httpStatus: response.status,
      endpoint,
      schedules: values.flatMap((value) => {
        const parsed = schedule(value)
        return parsed ? [parsed] : []
      }),
    }
  } catch (error) {
    return {
      ok: false,
      httpStatus: null,
      endpoint,
      error:
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Provider request timed out'
          : 'Provider request failed',
    }
  }
}
