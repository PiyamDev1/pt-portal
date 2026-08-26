import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingBookingIdSchema } from '@/lib/ticketing/completionContracts'
import {
  TICKET_ITINERARY_CAPABILITY_VERSION,
  TICKET_ITINERARY_MAX_SECTORS,
  TICKET_SCHEDULE_STATUSES,
  ticketingLocalDateTimeSchema,
  ticketingReplaceItinerarySchema,
  type TicketingItineraryAirline,
  type TicketingItineraryResponse,
  type TicketingItinerarySector,
} from '@/lib/ticketing/itineraryContracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

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

type RootTransactionRow = {
  id: string
  service_type: string
  parent_transaction_id: string | null
  operational_status: string
}

type BookingRow = {
  id: string
  version: number | string
  pnr: string
  customer_name: string
  operational_status: string
  owner_employee_id: string
  archived_at: string | null
  owner: Related<EmployeeRow>
  default_airline: Related<AirlineRow>
  ticket_transactions: Related<RootTransactionRow>
}

type SectorRow = {
  id: string
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
}

type AirportTimezoneRow = {
  iata_code: string
  timezone: string
  is_active: boolean
}

type TicketingRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

type ItineraryRpcResult = {
  booking?: {
    id?: string
    version?: number | string
    ownerEmployeeId?: string
    ownerEmployeeName?: string | null
    pnr?: string
    customerName?: string
    operationalStatus?: string
    defaultAirline?: {
      id?: string
      iataCode?: string
      name?: string
    }
  }
  rootTransaction?: { id?: string }
  itineraryVersion?: number | string
  sectors?: unknown
  changed?: unknown
  idempotentReplay?: unknown
}

type RouteContext = { params: Promise<{ bookingId: string }> }

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function firstRelated<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] || null : value
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function canReplaceOnBehalf(role: string) {
  const normalizedRole = normalizeRole(role)
  return ADMIN_ROLES.some((allowedRole) => normalizeRole(allowedRole) === normalizedRole)
}

function validPositiveInteger(value: number | string) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function validUuid(value: unknown): value is string {
  return z.string().uuid().safeParse(value).success
}

function validUtcTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && !Number.isNaN(Date.parse(value))
}

function airlineFromRow(row: AirlineRow | null): TicketingItineraryAirline | null {
  if (
    !row ||
    !validUuid(row.id) ||
    !/^[A-Z0-9]{2}$/.test(row.iata_code) ||
    !row.name?.trim()
  ) {
    return null
  }
  return { id: row.id, iataCode: row.iata_code, name: row.name.trim() }
}

function sectorFromRow(
  row: SectorRow,
  airportTimezones: ReadonlyMap<string, string>,
): TicketingItinerarySector | null {
  const sequenceNumber = validPositiveInteger(row.sequence_number)
  const itineraryVersion = validPositiveInteger(row.itinerary_version)
  const airline = airlineFromRow(firstRelated(row.airline))
  const departureLocal = ticketingLocalDateTimeSchema.safeParse(row.departure_local)
  const arrivalLocal = row.arrival_local
    ? ticketingLocalDateTimeSchema.safeParse(row.arrival_local)
    : null
  const scheduleStatus = TICKET_SCHEDULE_STATUSES.find(
    (status) => status === row.schedule_status,
  )
  const originTimezone = airportTimezones.get(row.origin_airport_code)
  const destinationTimezone = airportTimezones.get(row.destination_airport_code)

  if (
    !validUuid(row.id) ||
    !sequenceNumber ||
    !itineraryVersion ||
    !row.is_active ||
    row.retired_at ||
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
    (row.arrival_local === null) !== (row.arrival_at_utc === null) ||
    (row.arrival_local === null) !== (row.arrival_timezone === null) ||
    (row.arrival_timezone !== null && row.arrival_timezone !== destinationTimezone) ||
    (arrivalLocal !== null && !arrivalLocal.success) ||
    (row.arrival_at_utc !== null && !validUtcTimestamp(row.arrival_at_utc)) ||
    !scheduleStatus
  ) {
    return null
  }

  return {
    id: row.id,
    sequenceNumber,
    itineraryVersion,
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
  }
}

async function hasItineraryCapability(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  return !error && hasTicketingSchemaCapability(data, TICKET_ITINERARY_CAPABILITY_VERSION)
}

async function loadAccessibleItinerary(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  bookingId: string,
  actorEmployeeId: string,
  allowOnBehalf: boolean,
) {
  let bookingQuery = supabase
    .from('ticket_bookings')
    .select(
      `
        id,
        version,
        pnr,
        customer_name,
        operational_status,
        owner_employee_id,
        archived_at,
        owner:employees!ticket_bookings_owner_employee_id_fkey(id, full_name),
        default_airline:airlines!ticket_bookings_airline_id_fkey(id, iata_code, name),
        ticket_transactions!inner(id, service_type, parent_transaction_id, operational_status)
      `,
    )
    .eq('id', bookingId)

  if (!allowOnBehalf) bookingQuery = bookingQuery.eq('owner_employee_id', actorEmployeeId)

  const { data: bookingData, error: bookingError } = await bookingQuery
    .is('archived_at', null)
    .eq('ticket_transactions.service_type', 'TK')
    .is('ticket_transactions.parent_transaction_id', null)
    .in('ticket_transactions.operational_status', ['held', 'issued'])
    .maybeSingle()

  if (bookingError) return { detail: null, error: 'database' as const }
  if (!bookingData) return { detail: null, error: null }

  const booking = bookingData as unknown as BookingRow
  const owner = firstRelated(booking.owner)
  const defaultAirline = airlineFromRow(firstRelated(booking.default_airline))
  const rootTransaction = firstRelated(booking.ticket_transactions)
  const bookingVersion = validPositiveInteger(booking.version)
  if (
    !validUuid(booking.id) ||
    booking.id !== bookingId ||
    !bookingVersion ||
    booking.archived_at ||
    !['held', 'issued'].includes(booking.operational_status) ||
    !validUuid(booking.owner_employee_id) ||
    !owner ||
    owner.id !== booking.owner_employee_id ||
    !defaultAirline ||
    !rootTransaction ||
    !validUuid(rootTransaction.id) ||
    rootTransaction.service_type !== 'TK' ||
    rootTransaction.parent_transaction_id !== null ||
    !['held', 'issued'].includes(rootTransaction.operational_status) ||
    !booking.pnr?.trim() ||
    !booking.customer_name?.trim()
  ) {
    return { detail: null, error: 'invalid' as const }
  }

  const { data: sectorData, error: sectorError } = await supabase
    .from('ticket_itinerary_sectors')
    .select(
      `
        id,
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
        airline:airlines!ticket_itinerary_sectors_airline_id_fkey(id, iata_code, name)
      `,
    )
    .eq('booking_id', bookingId)
    .eq('source_transaction_id', rootTransaction.id)
    .eq('is_active', true)
    .is('retired_at', null)
    .order('sequence_number', { ascending: true })
    .limit(TICKET_ITINERARY_MAX_SECTORS + 1)

  if (sectorError) return { detail: null, error: 'database' as const }
  const rows = (sectorData || []) as unknown as SectorRow[]
  const airportCodes = [
    ...new Set(
      rows.flatMap((sector) => [
        sector.origin_airport_code,
        sector.destination_airport_code,
      ]),
    ),
  ]
  let airportTimezones = new Map<string, string>()
  if (airportCodes.length > 0) {
    const { data: airportData, error: airportError } = await supabase
      .from('ticket_airports')
      .select('iata_code, timezone, is_active')
      .in('iata_code', airportCodes)
      .limit(TICKET_ITINERARY_MAX_SECTORS * 2)
    if (airportError) return { detail: null, error: 'database' as const }

    const airportRows = (airportData || []) as unknown as AirportTimezoneRow[]
    if (
      airportRows.length !== airportCodes.length ||
      airportRows.some(
        (airport) => !/^[A-Z]{3}$/.test(airport.iata_code) || !airport.timezone?.trim(),
      )
    ) {
      return { detail: null, error: 'invalid' as const }
    }
    airportTimezones = new Map(
      airportRows.map((airport) => [airport.iata_code, airport.timezone]),
    )
  }

  const sectors = rows.map((row) => sectorFromRow(row, airportTimezones))
  if (
    rows.length > TICKET_ITINERARY_MAX_SECTORS ||
    sectors.some((sector) => sector === null)
  ) {
    return { detail: null, error: 'invalid' as const }
  }

  const validSectors = sectors as TicketingItinerarySector[]
  const itineraryVersion = validSectors[0]?.itineraryVersion || 0
  if (
    validSectors.some(
      (sector, index) =>
        sector.sequenceNumber !== index + 1 || sector.itineraryVersion !== itineraryVersion,
    )
  ) {
    return { detail: null, error: 'invalid' as const }
  }

  const detail: TicketingItineraryResponse = {
    booking: {
      id: booking.id,
      version: bookingVersion,
      pnr: booking.pnr,
      customerName: booking.customer_name,
      operationalStatus: booking.operational_status,
      ownerEmployee: { id: owner.id, fullName: owner.full_name?.trim() || 'Staff member' },
      defaultAirline,
    },
    context: {
      isOnBehalf: booking.owner_employee_id !== actorEmployeeId,
      onBehalfReasonRequired: booking.owner_employee_id !== actorEmployeeId,
    },
    itineraryVersion,
    sectors: validSectors,
  }
  return { detail, error: null }
}

function currentItineraryVersion(details: string | null | undefined) {
  try {
    const parsed = JSON.parse(details || '{}') as Record<string, unknown>
    const version = Number(parsed.itineraryVersion ?? parsed.currentItineraryVersion)
    return Number.isSafeInteger(version) && version >= 0 ? version : undefined
  } catch {
    return undefined
  }
}

function mutationError(error: TicketingRpcError) {
  const hint = String(error.hint || '')
  const code = String(error.code || '')

  if (code === 'P0002' || hint === 'TICKETING_RECORD_NOT_FOUND') {
    return privateError('Ticket record not found.', 404)
  }
  if (
    code === '40001' ||
    hint === 'TICKETING_VERSION_CONFLICT' ||
    hint === 'TICKETING_ITINERARY_VERSION_CONFLICT'
  ) {
    const currentVersion = currentItineraryVersion(error.details)
    return privateError(
      'This itinerary changed after you opened it. Refresh and review your changes.',
      409,
      {
        code: 'VERSION_CONFLICT',
        ...(currentVersion !== undefined ? { currentVersion } : {}),
      },
    )
  }
  if (hint === 'TICKETING_IDEMPOTENCY_CONFLICT') {
    return privateError('This request ID was already used for a different itinerary.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (hint === 'TICKETING_ON_BEHALF_REASON_REQUIRED') {
    return privateError('Explain why you are updating another employee\'s itinerary.', 400, {
      code: 'ON_BEHALF_REASON_REQUIRED',
    })
  }
  if (hint === 'TICKETING_ON_BEHALF_REASON_NOT_ALLOWED') {
    return privateError('An admin reason is only valid for another employee\'s ticket.', 400, {
      code: 'ON_BEHALF_REASON_NOT_ALLOWED',
    })
  }
  if (hint === 'TICKETING_AIRPORT_NOT_FOUND' || hint === 'TICKETING_AIRPORT_INACTIVE') {
    return privateError('Select active airports from the Ticketing airport directory.', 400, {
      code: 'INVALID_AIRPORT',
    })
  }
  if (
    hint === 'TICKETING_LOCAL_TIME_INVALID' ||
    hint === 'TICKETING_LOCAL_TIME_GAP' ||
    hint === 'TICKETING_DST_GAP'
  ) {
    return privateError(
      'One local flight time does not exist in that airport timezone. Check the date and time.',
      400,
      { code: 'INVALID_LOCAL_TIME' },
    )
  }
  if (hint === 'TICKETING_ITINERARY_CHRONOLOGY_INVALID') {
    return privateError('A flight arrival cannot be before its departure.', 400, {
      code: 'INVALID_ITINERARY_CHRONOLOGY',
    })
  }
  if (code === '42501') return privateError('Forbidden', 403)
  if (['22007', '22023', '23503', '23505', '23514'].includes(code)) {
    return privateError('Invalid itinerary details.', 400)
  }
  return privateError('Unable to save the itinerary right now.', 500)
}

function itineraryFromRpcResult(
  data: unknown,
  bookingId: string,
  actorEmployeeId: string,
): TicketingItineraryResponse | null {
  const result = data as ItineraryRpcResult | null
  const bookingVersion = Number(result?.booking?.version)
  const itineraryVersion = Number(result?.itineraryVersion)
  const bookingAirline = airlineFromRow(
    result?.booking?.defaultAirline
      ? {
          id: result.booking.defaultAirline.id || '',
          iata_code: result.booking.defaultAirline.iataCode || '',
          name: result.booking.defaultAirline.name || '',
        }
      : null,
  )
  if (
    result?.booking?.id !== bookingId ||
    !validUuid(result.booking.ownerEmployeeId) ||
    !result.booking.pnr?.trim() ||
    !result.booking.customerName?.trim() ||
    !result.booking.operationalStatus?.trim() ||
    !bookingAirline ||
    !Number.isSafeInteger(bookingVersion) ||
    bookingVersion <= 0 ||
    !validUuid(result.rootTransaction?.id) ||
    !Number.isSafeInteger(itineraryVersion) ||
    itineraryVersion <= 0 ||
    !Array.isArray(result.sectors) ||
    result.sectors.length < 1 ||
    result.sectors.length > TICKET_ITINERARY_MAX_SECTORS ||
    typeof result.changed !== 'boolean' ||
    typeof result.idempotentReplay !== 'boolean'
  ) {
    return null
  }

  const sectors = result.sectors.map((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const sector = value as Record<string, unknown>
    const sequenceNumber = Number(sector.sequenceNumber)
    const sectorVersion = Number(sector.itineraryVersion)
    const departureLocal = ticketingLocalDateTimeSchema.safeParse(sector.departureLocal)
    const arrivalLocal =
      sector.arrivalLocal === null
        ? null
        : ticketingLocalDateTimeSchema.safeParse(sector.arrivalLocal)
    const scheduleStatus = TICKET_SCHEDULE_STATUSES.find(
      (status) => status === sector.scheduleStatus,
    )
    const airline = airlineFromRow({
      id: typeof sector.airlineId === 'string' ? sector.airlineId : '',
      iata_code: typeof sector.airlineCode === 'string' ? sector.airlineCode : '',
      name: typeof sector.airlineName === 'string' ? sector.airlineName : '',
    })

    if (
      !validUuid(sector.id) ||
      !Number.isSafeInteger(sequenceNumber) ||
      sequenceNumber < 1 ||
      !Number.isSafeInteger(sectorVersion) ||
      sectorVersion !== itineraryVersion ||
      !airline ||
      typeof sector.flightNumber !== 'string' ||
      !sector.flightNumber.trim() ||
      typeof sector.originAirportCode !== 'string' ||
      !/^[A-Z]{3}$/.test(sector.originAirportCode) ||
      typeof sector.destinationAirportCode !== 'string' ||
      !/^[A-Z]{3}$/.test(sector.destinationAirportCode) ||
      sector.originAirportCode === sector.destinationAirportCode ||
      typeof sector.originTimezone !== 'string' ||
      !sector.originTimezone.trim() ||
      typeof sector.destinationTimezone !== 'string' ||
      !sector.destinationTimezone.trim() ||
      !departureLocal.success ||
      !validUtcTimestamp(sector.departureAtUtc) ||
      (sector.arrivalLocal === null) !== (sector.arrivalAtUtc === null) ||
      (arrivalLocal !== null && !arrivalLocal.success) ||
      (sector.arrivalAtUtc !== null && !validUtcTimestamp(sector.arrivalAtUtc)) ||
      !scheduleStatus
    ) {
      return null
    }

    const mapped: TicketingItinerarySector = {
      id: sector.id,
      sequenceNumber,
      itineraryVersion: sectorVersion,
      airline,
      flightNumber: sector.flightNumber.trim(),
      originIata: sector.originAirportCode,
      originTimezone: sector.originTimezone,
      destinationIata: sector.destinationAirportCode,
      destinationTimezone: sector.destinationTimezone,
      departureLocal: departureLocal.data,
      departureAtUtc: sector.departureAtUtc,
      arrivalLocal: arrivalLocal?.success ? arrivalLocal.data : null,
      arrivalAtUtc: typeof sector.arrivalAtUtc === 'string' ? sector.arrivalAtUtc : null,
      scheduleStatus,
    }
    return mapped
  })
  if (
    sectors.some((sector) => sector === null) ||
    sectors.some((sector, index) => sector?.sequenceNumber !== index + 1)
  ) {
    return null
  }

  const isOnBehalf = result.booking.ownerEmployeeId !== actorEmployeeId
  return {
    booking: {
      id: bookingId,
      version: bookingVersion,
      pnr: result.booking.pnr,
      customerName: result.booking.customerName,
      operationalStatus: result.booking.operationalStatus,
      ownerEmployee: {
        id: result.booking.ownerEmployeeId,
        fullName: result.booking.ownerEmployeeName?.trim() || 'Staff member',
      },
      defaultAirline: bookingAirline,
    },
    context: { isOnBehalf, onBehalfReasonRequired: isOnBehalf },
    itineraryVersion,
    sectors: sectors as TicketingItinerarySector[],
    changed: result.changed,
    idempotentReplay: result.idempotentReplay,
  }
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const parsedBookingId = ticketingBookingIdSchema.safeParse((await params).bookingId)
  if (!parsedBookingId.success) return privateError('Ticket record not found.', 404)

  const supabase = getServiceSupabaseClient()
  if (!(await hasItineraryCapability(supabase))) {
    return privateError('Ticket itinerary entry is not installed on this database.', 503)
  }

  const loaded = await loadAccessibleItinerary(
    supabase,
    parsedBookingId.data,
    access.employee.id,
    canReplaceOnBehalf(access.employee.role),
  )
  if (loaded.error === 'database') {
    return privateError('Unable to load the itinerary right now.', 500)
  }
  if (loaded.error === 'invalid') {
    return privateError('Unable to load the itinerary safely.', 500)
  }
  if (!loaded.detail) return privateError('Ticket record not found.', 404)

  return apiOk(loaded.detail, PRIVATE_RESPONSE)
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const parsedBookingId = ticketingBookingIdSchema.safeParse((await params).bookingId)
  if (!parsedBookingId.success) return privateError('Ticket record not found.', 404)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.replace-root-itinerary',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: entry, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingReplaceItinerarySchema,
    { maxBytes: 32 * 1024 },
  )
  if (bodyError || !entry) return privateError(bodyError || 'Invalid itinerary details.', 400)

  const supabase = getServiceSupabaseClient()
  if (!(await hasItineraryCapability(supabase))) {
    return privateError('Ticket itinerary entry is not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_replace_root_tk_itinerary', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: parsedBookingId.data,
    p_expected_itinerary_version: entry.expectedVersion,
    p_idempotency_key: entry.requestId,
    p_sectors: entry.sectors.map((sector) => ({
      airlineId: sector.airlineId,
      flightNumber: sector.flightNumber,
      originAirportCode: sector.originIata,
      destinationAirportCode: sector.destinationIata,
      departureLocal: sector.departureLocal,
      arrivalLocal: sector.arrivalLocal,
    })),
    p_on_behalf_reason: entry.adminReason,
  })
  if (error) return mutationError(error)
  const result = itineraryFromRpcResult(data, parsedBookingId.data, access.employee.id)
  if (!result) {
    return privateError('Ticketing returned an invalid itinerary result.', 500)
  }
  if (
    !canReplaceOnBehalf(access.employee.role) &&
    result.booking.ownerEmployee.id !== access.employee.id
  ) {
    return privateError('Ticketing returned an invalid itinerary result.', 500)
  }
  return apiOk(result, PRIVATE_RESPONSE)
}
