import { NextRequest } from 'next/server'
import { Buffer } from 'node:buffer'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const TICKETING_SERVICE_TRANSACTION_VERSION = 2026082304
const MATCH_PAGE_SIZE = 10
const PASSENGER_TYPES = ['ADT', 'CHD', 'INF'] as const
const PACKAGE_MATCH_STATUSES = ['unmatched', 'matched', 'ambiguous', 'manually_resolved'] as const
const TIMESTAMPTZ_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/

const exactPnrSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((value) => value.toUpperCase().replace(/\s+/g, ''))
  .refine((value) => value.length >= 1 && value.length <= 20)

const lookupCursorSchema = z
  .object({
    updatedAt: z
      .string()
      .max(64)
      .regex(TIMESTAMPTZ_PATTERN)
      .refine((value) => !Number.isNaN(Date.parse(value))),
    bookingId: z.string().uuid(),
  })
  .strict()

type Related<T> = T | T[] | null

type AirlineRow = {
  id: string
  iata_code: string
  name: string
}

type FareRow = {
  passenger_type: (typeof PASSENGER_TYPES)[number]
  quantity: number | string
}

type RootTransactionRow = {
  id: string
  version: number | string
  service_type: string
  operational_status: string
  parent_transaction_id: string | null
  booking_date: string
  ticket_passenger_fare_lines: FareRow[] | null
  ticket_transaction_passengers: Array<{
    passenger_id: string
    position: number | string
    ticket_passengers: Related<{ id: string; passenger_type: (typeof PASSENGER_TYPES)[number]; full_name: string | null }>
  }> | null
}

type BookingRow = {
  id: string
  version: number | string
  updated_at: string
  pnr: string
  customer_name: string
  contact_phone: string | null
  departure_date: string | null
  return_date: string | null
  operational_status: string
  package_match_status: string
  archived_at: string | null
  airlines: Related<AirlineRow>
  ticket_transactions: Related<RootTransactionRow>
}

function firstRelated<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] || null : value
}

function privateError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, PRIVATE_RESPONSE)
}

function parseLookupCursor(value: string) {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(value)) return null
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    const parsed = lookupCursorSchema.safeParse(decoded)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function createLookupCursor(row: BookingRow) {
  return Buffer.from(
    JSON.stringify({ updatedAt: row.updated_at, bookingId: row.id }),
    'utf8',
  ).toString('base64url')
}

function fareOrder(passengerType: (typeof PASSENGER_TYPES)[number]) {
  return PASSENGER_TYPES.indexOf(passengerType)
}

function bookingItem(row: BookingRow) {
  const airline = firstRelated(row.airlines)
  const rootTransaction = firstRelated(row.ticket_transactions)
  const bookingVersion = Number(row.version)
  const rootTransactionVersion = Number(rootTransaction?.version)
  const packageMatchStatus = PACKAGE_MATCH_STATUSES.find(
    (status) => status === row.package_match_status,
  )

  if (
    row.archived_at ||
    !lookupCursorSchema.shape.bookingId.safeParse(row.id).success ||
    !lookupCursorSchema.shape.updatedAt.safeParse(row.updated_at).success ||
    row.operational_status !== 'issued' ||
    !airline ||
    !rootTransaction ||
    rootTransaction.service_type !== 'TK' ||
    rootTransaction.parent_transaction_id !== null ||
    rootTransaction.operational_status !== 'issued' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(rootTransaction.booking_date) ||
    !Number.isSafeInteger(bookingVersion) ||
    bookingVersion < 1 ||
    !Number.isSafeInteger(rootTransactionVersion) ||
    rootTransactionVersion < 1 ||
    !packageMatchStatus
  ) {
    return null
  }

  const fares = (rootTransaction.ticket_passenger_fare_lines || [])
    .map((fare) => ({
      passengerType: fare.passenger_type,
      quantity: Number(fare.quantity),
    }))
    .sort((left, right) => fareOrder(left.passengerType) - fareOrder(right.passengerType))

  if (
    fares.length < 1 ||
    fares.length > 3 ||
    new Set(fares.map((fare) => fare.passengerType)).size !== fares.length ||
    fares.reduce((total, fare) => total + fare.quantity, 0) > 99 ||
    fares.some(
      (fare) =>
        !PASSENGER_TYPES.includes(fare.passengerType) ||
        !Number.isInteger(fare.quantity) ||
        fare.quantity < 1 ||
        fare.quantity > 99,
    )
  ) {
    return null
  }

  const passengers = (rootTransaction.ticket_transaction_passengers || [])
    .map((allocation) => {
      const passenger = firstRelated(allocation.ticket_passengers)
      return passenger
        ? {
            id: passenger.id,
            passengerType: passenger.passenger_type,
            position: Number(allocation.position),
            fullName: passenger.full_name,
          }
        : null
    })
    .filter((passenger): passenger is NonNullable<typeof passenger> => passenger !== null)
    .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))

  return {
    bookingId: row.id,
    bookingVersion,
    rootTransactionId: rootTransaction.id,
    rootTransactionVersion,
    rootBookingDate: rootTransaction.booking_date,
    pnr: row.pnr,
    customerName: row.customer_name,
    contactPhone: row.contact_phone,
    departureDate: row.departure_date,
    returnDate: row.return_date,
    operationalStatus: 'issued' as const,
    airline: { id: airline.id, iataCode: airline.iata_code, name: airline.name },
    packageMatchStatus,
    fares,
    passengers,
  }
}

async function hasServiceTransactionCapability(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  return !error && hasTicketingSchemaCapability(data, TICKETING_SERVICE_TRANSACTION_VERSION)
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const suppliedKeys = [...request.nextUrl.searchParams.keys()]
  const pnrValues = request.nextUrl.searchParams.getAll('pnr')
  const cursorValues = request.nextUrl.searchParams.getAll('cursor')
  if (
    suppliedKeys.some((key) => key !== 'pnr' && key !== 'cursor') ||
    pnrValues.length !== 1 ||
    cursorValues.length > 1
  ) {
    return privateError('Enter one exact PNR.', 400)
  }

  const parsedPnr = exactPnrSchema.safeParse(pnrValues[0])
  if (!parsedPnr.success) return privateError('Enter one exact PNR.', 400)
  const parsedCursor = cursorValues.length === 1 ? parseLookupCursor(cursorValues[0]) : undefined
  if (cursorValues.length === 1 && !parsedCursor) {
    return privateError('Restart the PNR lookup.', 400, { code: 'INVALID_LOOKUP_CURSOR' })
  }

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.own-booking-pnr-lookup',
    limit: 120,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const supabase = getServiceSupabaseClient()
  if (!(await hasServiceTransactionCapability(supabase))) {
    return privateError('Ticketing DC/R-ER entry is not installed on this database.', 503)
  }

  let query = supabase
    .from('ticket_bookings')
    .select(
      `
        id,
        version,
        updated_at,
        pnr,
        customer_name,
        contact_phone,
        departure_date,
        return_date,
        operational_status,
        package_match_status,
        archived_at,
        airlines!inner(id, iata_code, name),
        ticket_transactions!inner(
          id,
          version,
          service_type,
          operational_status,
          parent_transaction_id,
          booking_date,
          ticket_passenger_fare_lines(
            passenger_type,
            quantity
          ),
          ticket_transaction_passengers(
            passenger_id,
            position,
            ticket_passengers!inner(id, passenger_type, full_name)
          )
        )
      `,
    )
    .eq('owner_employee_id', access.employee.id)
    .eq('normalized_pnr', parsedPnr.data)
    .eq('operational_status', 'issued')
    .is('archived_at', null)
    .eq('ticket_transactions.service_type', 'TK')
    .is('ticket_transactions.parent_transaction_id', null)
    .eq('ticket_transactions.operational_status', 'issued')

  if (parsedCursor) {
    query = query.or(
      `updated_at.lt.${parsedCursor.updatedAt},and(updated_at.eq.${parsedCursor.updatedAt},id.lt.${parsedCursor.bookingId})`,
    )
  }

  const { data, error } = await query
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MATCH_PAGE_SIZE + 1)

  if (error) return privateError('Unable to find that ticket right now.', 500)

  const rows = (data || []) as unknown as BookingRow[]
  const items = rows.map(bookingItem)
  if (items.some((item) => item === null)) {
    return privateError('Unable to load that ticket safely.', 500)
  }

  const hasMore = rows.length > MATCH_PAGE_SIZE
  const pageRows = rows.slice(0, MATCH_PAGE_SIZE)
  return apiOk(
    {
      items: items.slice(0, MATCH_PAGE_SIZE),
      hasMore,
      nextCursor: hasMore ? createLookupCursor(pageRows[pageRows.length - 1]) : null,
    },
    PRIVATE_RESPONSE,
  )
}
