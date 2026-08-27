import { Buffer } from 'node:buffer'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import {
  TICKET_SCHEDULE_CHANGE_CAPABILITY_VERSION,
  TICKET_SCHEDULE_STATUSES,
  ticketingLocalDateTimeSchema,
  type TicketingActiveScheduleChange,
  type TicketingFlightMonitorItem,
  type TicketingFlightMonitorResponse,
  type TicketingItineraryAirline,
} from '@/lib/ticketing/itineraryContracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/

const monitorQuerySchema = z
  .object({
    status: z.enum(TICKET_SCHEDULE_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,1024}$/)
      .optional(),
  })
  .strict()

const monitorCursorSchema = z
  .object({
    departureAtUtc: z
      .string()
      .max(64)
      .regex(TIMESTAMPTZ_PATTERN)
      .refine((value) => !Number.isNaN(Date.parse(value))),
    sectorId: z.string().uuid(),
    status: z.enum(TICKET_SCHEDULE_STATUSES).nullable(),
  })
  .strict()

type Related<T> = T | T[] | null

type EmployeeRow = {
  id: string
  full_name: string | null
}

type AirlineRow = {
  id: string
  iata_code: string
  name: string
}

type BookingRow = {
  id: string
  version: number | string
  pnr: string
  customer_name: string
  contact_phone: string | null
  operational_status: string
  owner_employee_id: string
  archived_at: string | null
  owner: Related<EmployeeRow>
}

type RootTransactionRow = {
  id: string
  service_type: string
  parent_transaction_id: string | null
  operational_status: string
  passenger_ticket_count: number | string
  ticket_transaction_passengers: PassengerAllocationRow[] | null
}

type PassengerAllocationRow = {
  id: string
  position: number | string
  ticket_passengers: Related<PassengerRow>
}

type PassengerRow = {
  id: string
  passenger_type: 'ADT' | 'CHD' | 'INF'
  full_name: string | null
}

type MonitorSectorRow = {
  id: string
  booking_id: string
  sequence_number: number | string
  itinerary_version: number | string
  airline_id: string | null
  flight_number: string | null
  origin_airport_code: string
  destination_airport_code: string
  departure_local: string
  departure_timezone: string
  departure_at_utc: string
  arrival_local: string | null
  arrival_timezone: string | null
  arrival_at_utc: string | null
  schedule_status: string
  is_active: boolean
  retired_at: string | null
  airline: Related<AirlineRow>
  ticket_bookings: Related<BookingRow>
  source_transaction: Related<RootTransactionRow>
}

type AirportTimezoneRow = {
  iata_code: string
  timezone: string
}

type ActiveScheduleChangeRow = {
  sector_id: string
  change_case_id: string
  event_version: number | string
  proposed_schedule: unknown
  marked_by_employee_id: string
  marked_by_employee_name: string | null
  marked_at: string
  mark_reason: string | null
  reviewed_by_employee_id: string | null
  reviewed_by_employee_name: string | null
  reviewed_at: string | null
  review_reason: string | null
}

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function firstRelated<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] || null : value
}

function validUuid(value: unknown): value is string {
  return z.string().uuid().safeParse(value).success
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function canResolveOnBehalf(role: string) {
  const normalizedRole = normalizeRole(role)
  return ADMIN_ROLES.some((allowedRole) => normalizeRole(allowedRole) === normalizedRole)
}

function positiveInteger(value: number | string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function validUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    TIMESTAMPTZ_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  )
}

function airlineFromRow(row: AirlineRow | null): TicketingItineraryAirline | null {
  if (!row || !validUuid(row.id) || !/^[A-Z0-9]{2}$/.test(row.iata_code) || !row.name?.trim()) {
    return null
  }
  return { id: row.id, iataCode: row.iata_code, name: row.name.trim() }
}

function activeScheduleChangeFromRow(
  row: ActiveScheduleChangeRow,
): TicketingActiveScheduleChange | null {
  const proposed =
    row.proposed_schedule &&
    typeof row.proposed_schedule === 'object' &&
    !Array.isArray(row.proposed_schedule)
      ? (row.proposed_schedule as Record<string, unknown>)
      : null
  const departureLocal = ticketingLocalDateTimeSchema.safeParse(proposed?.departureLocal)
  const arrivalLocal =
    proposed?.arrivalLocal === null
      ? null
      : ticketingLocalDateTimeSchema.safeParse(proposed?.arrivalLocal)
  const eventVersion = positiveInteger(row.event_version)
  const hasReviewer = row.reviewed_by_employee_id !== null

  if (
    !validUuid(row.sector_id) ||
    !validUuid(row.change_case_id) ||
    !eventVersion ||
    !proposed ||
    typeof proposed.flightNumber !== 'string' ||
    !proposed.flightNumber.trim() ||
    !departureLocal.success ||
    !validUtcTimestamp(proposed.departureAtUtc) ||
    (proposed.arrivalLocal === null) !== (proposed.arrivalAtUtc === null) ||
    (arrivalLocal !== null && !arrivalLocal.success) ||
    (proposed.arrivalAtUtc !== null && !validUtcTimestamp(proposed.arrivalAtUtc)) ||
    !validUuid(row.marked_by_employee_id) ||
    !row.marked_at ||
    Number.isNaN(Date.parse(row.marked_at)) ||
    !row.mark_reason?.trim() ||
    hasReviewer !== (row.reviewed_at !== null) ||
    hasReviewer !== (row.review_reason !== null) ||
    (hasReviewer && !validUuid(row.reviewed_by_employee_id)) ||
    (row.reviewed_at !== null && Number.isNaN(Date.parse(row.reviewed_at)))
  ) {
    return null
  }

  return {
    changeId: row.change_case_id,
    eventVersion,
    proposedSchedule: {
      flightNumber: proposed.flightNumber.trim(),
      departureLocal: departureLocal.data,
      departureAtUtc: proposed.departureAtUtc as string,
      arrivalLocal: arrivalLocal?.success ? arrivalLocal.data : null,
      arrivalAtUtc: typeof proposed.arrivalAtUtc === 'string' ? proposed.arrivalAtUtc : null,
    },
    markedBy: {
      id: row.marked_by_employee_id,
      fullName: row.marked_by_employee_name?.trim() || 'Staff member',
    },
    markedAt: row.marked_at,
    markReason: row.mark_reason.trim(),
    reviewedBy:
      hasReviewer && row.reviewed_by_employee_id
        ? {
            id: row.reviewed_by_employee_id,
            fullName: row.reviewed_by_employee_name?.trim() || 'Staff member',
          }
        : null,
    reviewedAt: row.reviewed_at,
    reviewReason: row.review_reason?.trim() || null,
  }
}

function parseCursor(value: string | undefined) {
  if (!value) return undefined
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    const parsed = monitorCursorSchema.safeParse(decoded)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function createCursor(
  row: MonitorSectorRow,
  status: (typeof TICKET_SCHEDULE_STATUSES)[number] | undefined,
) {
  return Buffer.from(
    JSON.stringify({
      departureAtUtc: row.departure_at_utc,
      sectorId: row.id,
      status: status || null,
    }),
    'utf8',
  ).toString('base64url')
}

function parseQuery(request: NextRequest) {
  const keys = [...request.nextUrl.searchParams.keys()]
  if (
    keys.some((key) => !['status', 'limit', 'cursor'].includes(key)) ||
    request.nextUrl.searchParams.getAll('status').length > 1 ||
    request.nextUrl.searchParams.getAll('limit').length > 1 ||
    request.nextUrl.searchParams.getAll('cursor').length > 1
  ) {
    return null
  }

  const parsed = monitorQuerySchema.safeParse({
    status: request.nextUrl.searchParams.get('status') || undefined,
    limit: request.nextUrl.searchParams.get('limit') || undefined,
    cursor: request.nextUrl.searchParams.get('cursor') || undefined,
  })
  if (!parsed.success) return null
  const cursor = parseCursor(parsed.data.cursor)
  if (cursor === null) return null
  if (cursor && cursor.status !== (parsed.data.status || null)) return null
  return { ...parsed.data, cursor }
}

function leadPassenger(transaction: RootTransactionRow, customerName: string) {
  const typeOrder = { ADT: 0, CHD: 1, INF: 2 } as const
  const persisted = (transaction.ticket_transaction_passengers || [])
    .flatMap((allocation) => {
      const passenger = firstRelated(allocation.ticket_passengers)
      const position = Number(allocation.position)
      if (
        !passenger?.full_name?.trim() ||
        !validUuid(allocation.id) ||
        !validUuid(passenger.id) ||
        !Number.isSafeInteger(position) ||
        position < 1 ||
        !(passenger.passenger_type in typeOrder)
      ) {
        return []
      }
      return [
        {
          name: passenger.full_name.trim(),
          typeOrder: typeOrder[passenger.passenger_type],
          position,
          allocationId: allocation.id,
        },
      ]
    })
    .sort(
      (left, right) =>
        left.typeOrder - right.typeOrder ||
        left.position - right.position ||
        left.allocationId.localeCompare(right.allocationId),
    )

  return persisted[0]?.name || customerName
}

function monitorItemFromRow(
  row: MonitorSectorRow,
  airportTimezones: ReadonlyMap<string, string>,
): TicketingFlightMonitorItem | null {
  const booking = firstRelated(row.ticket_bookings)
  const transaction = firstRelated(row.source_transaction)
  const owner = booking ? firstRelated(booking.owner) : null
  const airline = airlineFromRow(firstRelated(row.airline))
  const bookingVersion = booking ? positiveInteger(booking.version) : null
  const sequenceNumber = positiveInteger(row.sequence_number)
  const itineraryVersion = positiveInteger(row.itinerary_version)
  const passengerCount = transaction ? positiveInteger(transaction.passenger_ticket_count) : null
  const departureLocal = ticketingLocalDateTimeSchema.safeParse(row.departure_local)
  const arrivalLocal = row.arrival_local
    ? ticketingLocalDateTimeSchema.safeParse(row.arrival_local)
    : null
  const scheduleStatus = TICKET_SCHEDULE_STATUSES.find((status) => status === row.schedule_status)
  const originTimezone = airportTimezones.get(row.origin_airport_code)
  const destinationTimezone = airportTimezones.get(row.destination_airport_code)

  if (
    !validUuid(row.id) ||
    !validUuid(row.booking_id) ||
    !sequenceNumber ||
    !itineraryVersion ||
    !row.is_active ||
    row.retired_at ||
    !booking ||
    booking.id !== row.booking_id ||
    !bookingVersion ||
    booking.archived_at ||
    booking.operational_status !== 'issued' ||
    !validUuid(booking.owner_employee_id) ||
    !owner ||
    owner.id !== booking.owner_employee_id ||
    !validUuid(owner.id) ||
    !transaction ||
    !validUuid(transaction.id) ||
    transaction.service_type !== 'TK' ||
    transaction.parent_transaction_id !== null ||
    transaction.operational_status !== 'issued' ||
    !passengerCount ||
    passengerCount > 99 ||
    !booking.pnr?.trim() ||
    !booking.customer_name?.trim() ||
    !airline ||
    airline.id !== row.airline_id ||
    !row.flight_number?.trim() ||
    !/^[A-Z]{3}$/.test(row.origin_airport_code) ||
    !/^[A-Z]{3}$/.test(row.destination_airport_code) ||
    row.origin_airport_code === row.destination_airport_code ||
    !departureLocal.success ||
    !originTimezone ||
    row.departure_timezone !== originTimezone ||
    !destinationTimezone ||
    !validUtcTimestamp(row.departure_at_utc) ||
    (row.arrival_local === null) !== (row.arrival_timezone === null) ||
    (row.arrival_local === null) !== (row.arrival_at_utc === null) ||
    (row.arrival_timezone !== null && row.arrival_timezone !== destinationTimezone) ||
    (arrivalLocal !== null && !arrivalLocal.success) ||
    (row.arrival_at_utc !== null && !validUtcTimestamp(row.arrival_at_utc)) ||
    !scheduleStatus
  ) {
    return null
  }

  return {
    bookingId: booking.id,
    bookingVersion,
    sectorId: row.id,
    itineraryVersion,
    sequenceNumber,
    ownerEmployee: { id: owner.id, fullName: owner.full_name?.trim() || 'Staff member' },
    leadPassenger: leadPassenger(transaction, booking.customer_name),
    pnr: booking.pnr,
    contactPhone: booking.contact_phone,
    passengerCount,
    bookingStatus: booking.operational_status,
    airline,
    flightNumber: row.flight_number.trim(),
    originIata: row.origin_airport_code,
    originTimezone,
    destinationIata: row.destination_airport_code,
    destinationTimezone,
    departureLocal: departureLocal.data,
    departureAtUtc: row.departure_at_utc,
    arrivalLocal: arrivalLocal?.success ? arrivalLocal.data : null,
    arrivalAtUtc: row.arrival_at_utc,
    scheduleStatus,
    activeScheduleChange: null,
    allowedScheduleActions: [],
  }
}

async function monitorCount(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  generatedAt: string,
  status?: (typeof TICKET_SCHEDULE_STATUSES)[number],
) {
  let query = supabase
    .from('ticket_itinerary_sectors')
    .select(
      `
        id,
        ticket_bookings!inner(id),
        source_transaction:ticket_transactions!ticket_itinerary_sectors_transaction_booking_fkey!inner(id)
      `,
      { count: 'exact', head: true },
    )
    .eq('is_active', true)
    .is('retired_at', null)
    .gte('departure_at_utc', generatedAt)
    .eq('ticket_bookings.operational_status', 'issued')
    .is('ticket_bookings.archived_at', null)
    .eq('source_transaction.service_type', 'TK')
    .is('source_transaction.parent_transaction_id', null)
    .eq('source_transaction.operational_status', 'issued')

  if (status) query = query.eq('schedule_status', status)
  const { count, error } = await query
  return error || typeof count !== 'number' || count < 0 ? null : count
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const filters = parseQuery(request)
  if (!filters) return privateError('Invalid flight monitor filters.', 400)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.flight-monitor',
    limit: 120,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const supabase = getServiceSupabaseClient()
  const { data: capability, error: capabilityError } = await supabase.rpc('ticketing_schema_status')
  if (
    capabilityError ||
    !hasTicketingSchemaCapability(capability, TICKET_SCHEDULE_CHANGE_CAPABILITY_VERSION)
  ) {
    return privateError('Ticketing flight monitoring is not installed on this database.', 503)
  }

  const generatedAt = new Date().toISOString()
  const countsPromise = Promise.all([
    monitorCount(supabase, generatedAt),
    monitorCount(supabase, generatedAt, 'change_marked'),
    monitorCount(supabase, generatedAt, 'awaiting_finalisation'),
  ])

  let query = supabase
    .from('ticket_itinerary_sectors')
    .select(
      `
        id,
        booking_id,
        sequence_number,
        itinerary_version,
        airline_id,
        flight_number,
        origin_airport_code,
        destination_airport_code,
        departure_local,
        departure_timezone,
        departure_at_utc,
        arrival_local,
        arrival_timezone,
        arrival_at_utc,
        schedule_status,
        is_active,
        retired_at,
        airline:airlines!ticket_itinerary_sectors_airline_id_fkey(id, iata_code, name),
        ticket_bookings!inner(
          id,
          version,
          pnr,
          customer_name,
          contact_phone,
          operational_status,
          owner_employee_id,
          archived_at,
          owner:employees!ticket_bookings_owner_employee_id_fkey(id, full_name)
        ),
        source_transaction:ticket_transactions!ticket_itinerary_sectors_transaction_booking_fkey!inner(
          id,
          service_type,
          parent_transaction_id,
          operational_status,
          passenger_ticket_count,
          ticket_transaction_passengers(
            id,
            position,
            ticket_passengers!inner(id, passenger_type, full_name)
          )
        )
      `,
    )
    .eq('is_active', true)
    .is('retired_at', null)
    .gte('departure_at_utc', generatedAt)
    .eq('ticket_bookings.operational_status', 'issued')
    .is('ticket_bookings.archived_at', null)
    .eq('source_transaction.service_type', 'TK')
    .is('source_transaction.parent_transaction_id', null)
    .eq('source_transaction.operational_status', 'issued')

  if (filters.status) query = query.eq('schedule_status', filters.status)
  if (filters.cursor) {
    query = query.or(
      `departure_at_utc.gt.${filters.cursor.departureAtUtc},and(departure_at_utc.eq.${filters.cursor.departureAtUtc},id.gt.${filters.cursor.sectorId})`,
    )
  }

  const [{ data, error }, counts] = await Promise.all([
    query
      .order('departure_at_utc', { ascending: true })
      .order('id', { ascending: true })
      .limit(filters.limit + 1),
    countsPromise,
  ])

  if (error || counts.some((count) => count === null)) {
    return privateError('Unable to load flight monitoring right now.', 500)
  }

  const rows = (data || []) as unknown as MonitorSectorRow[]
  const pageRows = rows.slice(0, filters.limit)
  const airportCodes = [
    ...new Set(pageRows.flatMap((row) => [row.origin_airport_code, row.destination_airport_code])),
  ]
  let airportTimezones = new Map<string, string>()
  if (airportCodes.length > 0) {
    const { data: airportData, error: airportError } = await supabase
      .from('ticket_airports')
      .select('iata_code, timezone')
      .in('iata_code', airportCodes)
      .limit(MAX_LIMIT * 2)
    if (airportError) return privateError('Unable to load flight monitoring right now.', 500)

    const airports = (airportData || []) as unknown as AirportTimezoneRow[]
    if (
      airports.length !== airportCodes.length ||
      airports.some((airport) => !/^[A-Z]{3}$/.test(airport.iata_code) || !airport.timezone?.trim())
    ) {
      return privateError('Unable to load flight monitoring safely.', 500)
    }
    airportTimezones = new Map(airports.map((airport) => [airport.iata_code, airport.timezone]))
  }

  const monitorItems = pageRows.map((row) => monitorItemFromRow(row, airportTimezones))
  if (monitorItems.some((item) => item === null)) {
    return privateError('Unable to load flight monitoring safely.', 500)
  }

  const openSectorIds = pageRows
    .filter((row) => row.schedule_status !== 'on_schedule')
    .map((row) => row.id)
  const activeChanges = new Map<string, TicketingActiveScheduleChange>()
  if (openSectorIds.length > 0) {
    const { data: changeData, error: changeError } = await supabase
      .from('ticket_active_schedule_changes')
      .select(
        `
          sector_id,
          change_case_id,
          event_version,
          proposed_schedule,
          marked_by_employee_id,
          marked_by_employee_name,
          marked_at,
          mark_reason,
          reviewed_by_employee_id,
          reviewed_by_employee_name,
          reviewed_at,
          review_reason
        `,
      )
      .in('sector_id', openSectorIds)
      .limit(MAX_LIMIT)
    if (changeError) return privateError('Unable to load flight monitoring right now.', 500)

    for (const row of (changeData || []) as unknown as ActiveScheduleChangeRow[]) {
      const mapped = activeScheduleChangeFromRow(row)
      if (!mapped || activeChanges.has(row.sector_id)) {
        return privateError('Unable to load flight monitoring safely.', 500)
      }
      activeChanges.set(row.sector_id, mapped)
    }
  }

  const mayResolveAny = canResolveOnBehalf(access.employee.role)
  const items = (monitorItems as TicketingFlightMonitorItem[]).map((item) => {
    const mayResolve = mayResolveAny || item.ownerEmployee.id === access.employee.id
    const allowedScheduleActions: TicketingFlightMonitorItem['allowedScheduleActions'] =
      item.scheduleStatus === 'on_schedule'
        ? ['mark']
        : !mayResolve
          ? []
          : item.scheduleStatus === 'change_marked'
            ? ['review', 'dismiss']
            : ['finalise', 'dismiss']
    return {
      ...item,
      activeScheduleChange: activeChanges.get(item.sectorId) || null,
      allowedScheduleActions,
    }
  })
  if (
    items.some(
      (item) =>
        (item.scheduleStatus === 'on_schedule') !== (item.activeScheduleChange === null) ||
        (item.scheduleStatus === 'change_marked' &&
          item.activeScheduleChange?.reviewedBy !== null) ||
        (item.scheduleStatus === 'awaiting_finalisation' &&
          item.activeScheduleChange?.reviewedBy === null),
    )
  ) {
    return privateError('Unable to load flight monitoring safely.', 500)
  }

  const response: TicketingFlightMonitorResponse = {
    generatedAt,
    counts: {
      upcoming: counts[0] as number,
      changeMarked: counts[1] as number,
      awaitingFinalisation: counts[2] as number,
    },
    items,
    nextCursor:
      rows.length > filters.limit && pageRows.length > 0
        ? createCursor(pageRows[pageRows.length - 1], filters.status)
        : null,
  }
  return apiOk(response, PRIVATE_RESPONSE)
}
