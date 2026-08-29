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
  providerCheck: {
    checkedAt: string | null
    outcome: 'matched' | 'change_detected' | 'not_found' | 'failed' | null
    providerStatus: string | null
    scheduleChangeDetectedAt: string | null
  } | null
  activeScheduleChange: {
    changeId: string
    eventVersion: number
    proposedSchedule: {
      flightNumber: string
      departureLocal: string
      departureAtUtc: string
      arrivalLocal: string | null
      arrivalAtUtc: string | null
    }
    markedBy: { id: string; fullName: string }
    markedAt: string
    markReason: string
    reviewedBy: { id: string; fullName: string } | null
    reviewedAt: string | null
    reviewReason: string | null
  } | null
  allowedScheduleActions: ScheduleChangeAction[]
}

export type ScheduleChangeAction = 'mark' | 'review' | 'finalise' | 'dismiss'

export type ScheduleChangeMutation = {
  requestId: string
  action: ScheduleChangeAction
  expectedItineraryVersion: number
  changeId: string | null
  proposal: {
    flightNumber: string
    departureLocal: string
    arrivalLocal: string | null
  } | null
  reason: string
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

export type FlightMonitoringFilters = {
  status?: string
  ownerEmployeeId?: string
  departureFrom?: string
  departureTo?: string
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
  filters: FlightMonitoringFilters = {},
): Promise<FlightMonitoringPayload> {
  const search = new URLSearchParams({ limit: '100' })
  if (cursor) search.set('cursor', cursor)
  if (filters.status && filters.status !== 'all') search.set('status', filters.status)
  if (filters.ownerEmployeeId) search.set('ownerEmployeeId', filters.ownerEmployeeId)
  if (filters.departureFrom) search.set('departureFrom', filters.departureFrom)
  if (filters.departureTo) search.set('departureTo', filters.departureTo)
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

export async function updateScheduleChange(
  sectorId: string,
  mutation: ScheduleChangeMutation,
): Promise<void> {
  const response = await fetch(
    `/api/ticketing/flight-monitor/${encodeURIComponent(sectorId)}/schedule-change`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutation),
    },
  )
  const payload = (await response.json().catch(() => ({}))) as ApiErrorPayload
  if (!response.ok) {
    throw new FlightMonitoringApiError(payload.error || 'Unable to update the flight schedule')
  }
}
