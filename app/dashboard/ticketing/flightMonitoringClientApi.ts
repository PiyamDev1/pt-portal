export type FlightMonitoringItem = {
  bookingId: string
  bookingVersion: number
  sectorId: string
  itineraryVersion: number
  sequenceNumber: number
  ownerEmployee: {
    id: string
    fullName: string
  }
  leadPassenger: string
  pnr: string
  contactPhone: string | null
  passengerCount: number
  bookingStatus: string
  airline: {
    id: string
    iataCode: string
    name: string
  }
  flightNumber: string
  originIata: string
  originTimezone: string
  destinationIata: string
  destinationTimezone: string
  departureLocal: string
  departureAtUtc: string
  arrivalLocal: string | null
  arrivalAtUtc: string | null
  scheduleStatus: string
}

export type FlightMonitoringPayload = {
  generatedAt: string
  counts: {
    upcoming: number
    changeMarked: number
    awaitingFinalisation: number
  }
  items: FlightMonitoringItem[]
  nextCursor: string | null
}

type ApiErrorPayload = {
  error?: string
}

export class FlightMonitoringApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlightMonitoringApiError'
  }
}

export async function loadFlightMonitoring(
  signal?: AbortSignal,
  cursor?: string,
): Promise<FlightMonitoringPayload> {
  const search = new URLSearchParams({ limit: '100' })
  if (cursor) search.set('cursor', cursor)
  const response = await fetch(`/api/ticketing/flight-monitor?${search.toString()}`, {
    cache: 'no-store',
    signal,
  })
  const payload = (await response.json().catch(() => ({}))) as Partial<FlightMonitoringPayload> &
    ApiErrorPayload

  if (!response.ok) {
    throw new FlightMonitoringApiError(payload.error || 'Unable to load upcoming flights')
  }

  if (
    !Array.isArray(payload.items) ||
    typeof payload.generatedAt !== 'string' ||
    !payload.counts ||
    typeof payload.counts.upcoming !== 'number' ||
    typeof payload.counts.changeMarked !== 'number' ||
    typeof payload.counts.awaitingFinalisation !== 'number' ||
    (payload.nextCursor !== null && typeof payload.nextCursor !== 'string')
  ) {
    throw new FlightMonitoringApiError('Flight Monitoring returned an invalid result. Try again.')
  }

  return payload as FlightMonitoringPayload
}
