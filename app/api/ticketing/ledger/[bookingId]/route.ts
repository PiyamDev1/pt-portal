import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import {
  ticketingBookingIdSchema,
  ticketingCompleteTkDetailsSchema,
  ticketingDetailsStatus,
  type TicketingCompletionDetail,
  type TicketingCompletionFare,
  type TicketingCompletionPassenger,
} from '@/lib/ticketing/completionContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const TICKETING_COMPLETION_VERSION = 2026082202
const POSTED_OPERATIONAL_STATUSES = new Set(['issued', 'cancelled', 'part_refunded', 'refunded'])

type Related<T> = T | T[] | null

type AirlineRow = {
  id: string
  iata_code: string
  name: string
}

type LocationRow = {
  timezone: string
}

type BookingRow = {
  id: string
  version: number | string
  pnr: string
  customer_name: string
  contact_phone: string | null
  departure_date: string | null
  return_date: string | null
  archived_at: string | null
  airlines: Related<AirlineRow>
  locations: Related<LocationRow>
}

type FareRow = {
  id: string
  passenger_type: 'ADT' | 'CHD' | 'INF'
  quantity: number
  unit_supplier_cost_source: number | string | null
  unit_sale_price_source: number | string | null
}

type PassengerRow = {
  id: string
  passenger_type: 'ADT' | 'CHD' | 'INF'
  full_name: string | null
  contact_phone: string | null
  date_of_birth: string | null
}

type PassengerAllocationRow = {
  id: string
  position: number
  ticket_number: string | null
  ticket_passengers: Related<PassengerRow>
}

type TransactionRow = {
  id: string
  version: number | string
  operational_status: string
  payment_status: 'unpaid' | 'part_paid' | 'paid'
  paid_at: string | null
  ticket_bookings: Related<BookingRow>
  ticket_passenger_fare_lines: FareRow[] | null
  ticket_transaction_passengers: PassengerAllocationRow[] | null
}

type CompletionRpcResult = {
  booking?: { id?: string }
  transaction?: { id?: string }
  changed?: boolean
  idempotentReplay?: boolean
}

type TicketingRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

function firstRelated<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] || null : value
}

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function money(value: number | string | null) {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function branchDate(value: string | null, timezone: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function fareOrder(passengerType: FareRow['passenger_type']) {
  if (passengerType === 'ADT') return 0
  if (passengerType === 'CHD') return 1
  return 2
}

function mappedPassengers(
  allocations: PassengerAllocationRow[],
  fares: TicketingCompletionFare[],
  customerName: string,
) {
  const persistedByType = new Map<FareRow['passenger_type'], TicketingCompletionPassenger[]>()

  for (const allocation of [...allocations].sort(
    (left, right) =>
      Number(left.position) - Number(right.position) || left.id.localeCompare(right.id),
  )) {
    const passenger = firstRelated(allocation.ticket_passengers)
    if (!passenger) continue
    const passengers = persistedByType.get(passenger.passenger_type) || []
    passengers.push({
      passengerType: passenger.passenger_type,
      position: Number(allocation.position),
      fullName: passenger.full_name,
      contactPhone: passenger.contact_phone,
      dateOfBirth: passenger.date_of_birth,
      ticketNumber: allocation.ticket_number,
    })
    persistedByType.set(passenger.passenger_type, passengers)
  }

  const persisted = [...persistedByType.values()].flat()
  const passengers: TicketingCompletionPassenger[] = []
  for (const fare of fares) {
    const existing = persistedByType.get(fare.passengerType) || []
    const byPosition = new Map(existing.map((passenger) => [passenger.position, passenger]))
    for (let position = 1; position <= fare.quantity; position += 1) {
      const persistedPassenger = byPosition.get(position)
      if (persistedPassenger) {
        passengers.push(persistedPassenger)
        continue
      }
      passengers.push({
        passengerType: fare.passengerType,
        position,
        fullName: fare.passengerType === 'ADT' && position === 1 ? customerName : null,
        contactPhone: null,
        dateOfBirth: null,
        ticketNumber: null,
      })
    }
  }

  return { persisted, passengers }
}

function detailFromRow(row: TransactionRow): TicketingCompletionDetail | null {
  const booking = firstRelated(row.ticket_bookings)
  const airline = booking ? firstRelated(booking.airlines) : null
  const location = booking ? firstRelated(booking.locations) : null
  if (!booking || booking.archived_at || !airline || !location) return null

  const fares: TicketingCompletionFare[] = (row.ticket_passenger_fare_lines || [])
    .map((fare) => {
      const unitSalePrice = money(fare.unit_sale_price_source)
      return {
        id: fare.id,
        passengerType: fare.passenger_type,
        quantity: Number(fare.quantity),
        unitSupplierCost: money(fare.unit_supplier_cost_source),
        unitSalePrice,
        salePriceLocked:
          unitSalePrice !== null &&
          (POSTED_OPERATIONAL_STATUSES.has(row.operational_status) ||
            row.payment_status === 'paid'),
      }
    })
    .sort((left, right) => fareOrder(left.passengerType) - fareOrder(right.passengerType))

  const { persisted, passengers } = mappedPassengers(
    row.ticket_transaction_passengers || [],
    fares,
    booking.customer_name,
  )

  return {
    bookingId: booking.id,
    transactionId: row.id,
    bookingVersion: Number(booking.version),
    transactionVersion: Number(row.version),
    pnr: booking.pnr,
    customerName: booking.customer_name,
    contactPhone: booking.contact_phone,
    departureDate: booking.departure_date,
    returnDate: booking.return_date,
    operationalStatus: row.operational_status,
    paymentStatus: row.payment_status,
    paidAt: branchDate(row.paid_at, location.timezone),
    airline: { id: airline.id, iataCode: airline.iata_code, name: airline.name },
    detailsStatus: ticketingDetailsStatus({
      contactPhone: booking.contact_phone,
      departureDate: booking.departure_date,
      fares,
      passengers: persisted,
    }),
    fares,
    passengers,
  }
}

async function hasCompletionCapability(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return false
  const status = data as Record<string, unknown>
  return status.ready === true && Number(status.version || 0) >= TICKETING_COMPLETION_VERSION
}

async function loadOwnDetail(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  bookingId: string,
  ownerEmployeeId: string,
) {
  const { data, error } = await supabase
    .from('ticket_transactions')
    .select(
      `
        id,
        version,
        operational_status,
        payment_status,
        paid_at,
        ticket_bookings!inner(
          id,
          version,
          pnr,
          customer_name,
          contact_phone,
          departure_date,
          return_date,
          archived_at,
          airlines!inner(id, iata_code, name),
          locations!inner(timezone)
        ),
        ticket_passenger_fare_lines(
          id,
          passenger_type,
          quantity,
          unit_supplier_cost_source,
          unit_sale_price_source
        ),
        ticket_transaction_passengers(
          id,
          position,
          ticket_number,
          ticket_passengers!inner(
            id,
            passenger_type,
            full_name,
            contact_phone,
            date_of_birth
          )
        )
      `,
    )
    .eq('booking_id', bookingId)
    .eq('owner_employee_id', ownerEmployeeId)
    .eq('service_type', 'TK')
    .is('parent_transaction_id', null)
    .is('ticket_bookings.archived_at', null)
    .maybeSingle()

  if (error) return { detail: null, error }
  return {
    detail: data ? detailFromRow(data as unknown as TransactionRow) : null,
    error: null,
  }
}

function parsedCurrentVersions(details: string | null | undefined) {
  try {
    const value = JSON.parse(details || '{}') as Record<string, unknown>
    const bookingVersion = Number(value.bookingVersion)
    const transactionVersion = Number(value.transactionVersion)
    if (!Number.isSafeInteger(bookingVersion) || !Number.isSafeInteger(transactionVersion)) {
      return undefined
    }
    return { bookingVersion, transactionVersion }
  } catch {
    return undefined
  }
}

function completionError(error: TicketingRpcError) {
  const hint = String(error.hint || '')
  const message = String(error.message || '')

  if (error.code === 'P0002' || hint === 'TICKETING_RECORD_NOT_FOUND') {
    return privateError('Ticket record not found.', 404)
  }
  if (error.code === '40001' || hint === 'TICKETING_VERSION_CONFLICT') {
    const currentVersions = parsedCurrentVersions(error.details)
    return privateError(
      'This ticket changed after you opened it. Refresh and review your changes.',
      409,
      {
        code: 'VERSION_CONFLICT',
        ...(currentVersions ? { currentVersions } : {}),
      },
    )
  }
  if (
    hint === 'TICKETING_IDEMPOTENCY_CONFLICT' ||
    (error.code === '22023' && /idempotency/i.test(message))
  ) {
    return privateError('This save key was already used for different ticket details.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (error.code === '55000' || hint === 'TICKETING_CORRECTION_REQUIRED') {
    return privateError('These posted ticket details require an audited correction.', 409, {
      code: 'CORRECTION_REQUIRED',
    })
  }
  if (error.code === '42501') return privateError('Forbidden', 403)
  if (['22007', '22023', '23503', '23514'].includes(String(error.code || ''))) {
    return privateError(message || 'Invalid ticket details', 400)
  }
  return privateError('Unable to save the ticket details right now.', 500)
}

type RouteContext = { params: Promise<{ bookingId: string }> }

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const parsedBookingId = ticketingBookingIdSchema.safeParse((await params).bookingId)
  if (!parsedBookingId.success) return privateError('Ticket record not found.', 404)

  const supabase = getServiceSupabaseClient()
  if (!(await hasCompletionCapability(supabase))) {
    return privateError('Ticketing record completion is not installed on this database.', 503)
  }

  const { detail, error } = await loadOwnDetail(supabase, parsedBookingId.data, access.employee.id)
  if (error) return privateError('Unable to load the ticket details right now.', 500)
  if (!detail) return privateError('Ticket record not found.', 404)

  return apiOk({ detail }, PRIVATE_RESPONSE)
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const parsedBookingId = ticketingBookingIdSchema.safeParse((await params).bookingId)
  if (!parsedBookingId.success) return privateError('Ticket record not found.', 404)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.complete-tk-details',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: details, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingCompleteTkDetailsSchema,
    { maxBytes: 64 * 1024 },
  )
  if (bodyError || !details) return privateError(bodyError || 'Invalid ticket details', 400)

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  if (!(await hasCompletionCapability(supabase))) {
    return privateError('Ticketing record completion is not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_complete_tk_details', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: parsedBookingId.data,
    p_idempotency_key: idempotencyKey,
    p_details: details,
  })
  if (error) return completionError(error)

  const result = data as unknown as CompletionRpcResult | null
  if (
    !result?.booking?.id ||
    !result.transaction?.id ||
    result.booking.id !== parsedBookingId.data
  ) {
    return privateError('Ticketing returned an invalid completion result.', 500)
  }

  const loaded = await loadOwnDetail(supabase, parsedBookingId.data, access.employee.id)
  if (loaded.error) return privateError('Unable to reload the saved ticket details.', 500)
  if (!loaded.detail) return privateError('Ticket record not found.', 404)
  if (loaded.detail.transactionId !== result.transaction.id) {
    return privateError('Ticketing returned an invalid completion result.', 500)
  }

  return apiOk(
    {
      detail: loaded.detail,
      changed: result.changed === true,
      idempotentReplay: result.idempotentReplay === true,
    },
    PRIVATE_RESPONSE,
  )
}
