import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import {
  ticketingQuickTkSchema,
  type TicketingAirlineOption,
  type TicketingLedgerFare,
  type TicketingLedgerItem,
  type TicketingQuickTkResult,
} from '@/lib/ticketing/contracts'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingDetailsStatus } from '@/lib/ticketing/completionContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const TICKETING_RUNTIME_VERSION = 2026082202

type Related<T> = T | T[] | null

type AirlineRow = {
  id: string
  iata_code: string
  name: string
}

type LocationRow = {
  name: string
  branch_code: string | null
  timezone: string
}

type EmployeeLocationRow = {
  locations: Related<LocationRow>
}

type BookingRow = {
  id: string
  version: number
  pnr: string
  customer_name: string
  contact_phone: string | null
  departure_date: string | null
  package_match_status: string
  commission_scope: string
  archived_at: string | null
  airlines: Related<AirlineRow>
}

type FareRow = {
  passenger_type: 'ADT' | 'CHD' | 'INF'
  quantity: number
  unit_supplier_cost_source: number | null
  unit_sale_price_source: number | null
}

type PassengerRow = {
  passenger_type: 'ADT' | 'CHD' | 'INF'
  full_name: string | null
}

type PassengerAllocationRow = {
  position: number
  ticket_passengers: Related<PassengerRow>
}

type TransactionRow = {
  id: string
  version: number
  booking_id: string
  service_type: 'TK' | 'DC' | 'R-ER'
  operational_status: string
  payment_status: string
  booking_date: string
  time_limit_at: string | null
  issued_at: string | null
  passenger_ticket_count: number
  created_at: string
  ticket_bookings: Related<BookingRow>
  ticket_passenger_fare_lines: FareRow[] | null
  ticket_transaction_passengers: PassengerAllocationRow[] | null
}

type TicketingRpcError = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

type TicketingQuickTkRpcResult = {
  booking?: {
    id?: string
    operationalStatus?: string
    paymentStatus?: string
  }
  transaction?: {
    id?: string
    serviceType?: string
    operationalStatus?: string
    paymentStatus?: string
    passengerTicketCount?: number
  }
  packageMatch?: { status?: string }
  idempotentReplay?: boolean
}

function firstRelated<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] || null : value
}

function airlineOption(row: AirlineRow): TicketingAirlineOption {
  return { id: row.id, iataCode: row.iata_code, name: row.name }
}

function ledgerItem(row: TransactionRow): TicketingLedgerItem | null {
  const booking = firstRelated(row.ticket_bookings)
  const airline = booking ? firstRelated(booking.airlines) : null
  if (!booking || booking.archived_at || !airline) return null

  const fares: TicketingLedgerFare[] = (row.ticket_passenger_fare_lines || []).map((fare) => ({
    passengerType: fare.passenger_type,
    quantity: fare.quantity,
    unitSupplierCost: fare.unit_supplier_cost_source,
    unitSalePrice: fare.unit_sale_price_source,
  }))
  const passengers = (row.ticket_transaction_passengers || [])
    .map((allocation) => ({
      position: Number(allocation.position),
      passenger: firstRelated(allocation.ticket_passengers),
    }))
    .filter(
      (entry): entry is { position: number; passenger: PassengerRow } => Boolean(entry.passenger),
    )
    .map(({ passenger, position }) => ({
      passengerType: passenger.passenger_type,
      position,
      fullName: passenger.full_name,
    }))

  return {
    bookingId: booking.id,
    transactionId: row.id,
    bookingVersion: Number(booking.version),
    transactionVersion: Number(row.version),
    pnr: booking.pnr,
    customerName: booking.customer_name,
    airline: airlineOption(airline),
    serviceType: row.service_type,
    operationalStatus: row.operational_status,
    paymentStatus: row.payment_status,
    bookingDate: row.booking_date,
    timeLimitAt: row.time_limit_at,
    issuedAt: row.issued_at,
    passengerCount: row.passenger_ticket_count,
    packageMatchStatus: booking.package_match_status,
    commissionScope: booking.commission_scope,
    detailsStatus: ticketingDetailsStatus({
      contactPhone: booking.contact_phone,
      departureDate: booking.departure_date,
      fares,
      passengers,
    }),
    fares,
    createdAt: row.created_at,
  }
}

function parseDuplicateDetails(error: TicketingRpcError) {
  if (
    error.hint !== 'TICKETING_DUPLICATE_TK' &&
    !String(error.message || '').includes('Duplicate TK confirmation required')
  ) {
    return null
  }

  try {
    const value = JSON.parse(error.details || '{}') as Record<string, unknown>
    const ownedByActor = value.ownedByActor === true
    return {
      bookingId: ownedByActor ? String(value.bookingId || '') : '',
      pnr: String(value.pnr || ''),
      customerName: ownedByActor ? String(value.customerName || '') : '',
      ownedByActor,
    }
  } catch {
    return { bookingId: '', pnr: '', customerName: '', ownedByActor: false }
  }
}

function mutationError(error: TicketingRpcError) {
  const duplicate = parseDuplicateDetails(error)
  if (duplicate) {
    return apiError('A TK record already exists for this airline and PNR.', 409, {
      code: 'DUPLICATE_TK',
      existing: duplicate,
    })
  }

  const message = String(error.message || '')
  if (error.code === '22023' && /idempotency/i.test(message)) {
    return apiError('This save key was already used for different ticket details.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (error.code === '42501') return apiError('Forbidden', 403)
  if (['22007', '22023', '23503', '23514', 'P0002'].includes(String(error.code || ''))) {
    return apiError(message || 'Invalid ticket details', 400)
  }
  return apiError('Unable to save the ticket right now.', 500)
}

async function hasTicketingRuntimeCapability(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) return false
  const status = data as Record<string, unknown>
  return status.ready === true && Number(status.version || 0) >= TICKETING_RUNTIME_VERSION
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 50)
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50
  const supabase = getServiceSupabaseClient()
  if (!(await hasTicketingRuntimeCapability(supabase))) {
    return apiError('Ticketing quick entry is not installed on this database.', 503)
  }

  const [transactionsResult, airlinesResult, employeeResult] = await Promise.all([
    supabase
      .from('ticket_transactions')
      .select(
        `
          id,
          version,
          booking_id,
          service_type,
          operational_status,
          payment_status,
          booking_date,
          time_limit_at,
          issued_at,
          passenger_ticket_count,
          created_at,
          ticket_bookings!inner(
            id,
            version,
            pnr,
            customer_name,
            contact_phone,
            departure_date,
            package_match_status,
            commission_scope,
            archived_at,
            airlines!inner(id, iata_code, name)
          ),
          ticket_passenger_fare_lines(
            passenger_type,
            quantity,
            unit_supplier_cost_source,
            unit_sale_price_source
          ),
          ticket_transaction_passengers(
            position,
            ticket_passengers!inner(
              passenger_type,
              full_name
            )
          )
        `,
      )
      .eq('owner_employee_id', access.employee.id)
      .is('ticket_bookings.archived_at', null)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase
      .from('airlines')
      .select('id, iata_code, name')
      .eq('is_active', true)
      .order('iata_code', { ascending: true }),
    supabase
      .from('employees')
      .select('locations(name, branch_code, timezone)')
      .eq('id', access.employee.id)
      .maybeSingle(),
  ])

  if (transactionsResult.error || airlinesResult.error || employeeResult.error) {
    return apiError('Unable to load the ticket ledger right now.', 500)
  }

  const items = ((transactionsResult.data || []) as unknown as TransactionRow[])
    .map(ledgerItem)
    .filter((item): item is TicketingLedgerItem => Boolean(item))
  const airlines = ((airlinesResult.data || []) as AirlineRow[]).map(airlineOption)
  const employee = employeeResult.data as unknown as EmployeeLocationRow | null
  const location = firstRelated(employee?.locations || null)

  return apiOk(
    {
      items,
      airlines,
      context: {
        employeeName: access.employee.fullName,
        locationName: location?.name || null,
        timezone: location?.timezone || 'Europe/London',
      },
    },
    PRIVATE_RESPONSE,
  )
}

export async function POST(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.quick-tk',
    limit: 90,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { data: entry, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingQuickTkSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !entry) return apiError(bodyError || 'Invalid ticket details', 400)

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return apiError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  if (!(await hasTicketingRuntimeCapability(supabase))) {
    return apiError('Ticketing quick entry is not installed on this database.', 503)
  }
  const { data, error } = await supabase.rpc('ticketing_create_quick_tk', {
    p_actor_employee_id: access.employee.id,
    p_idempotency_key: idempotencyKey,
    p_entry: entry,
  })

  if (error) return mutationError(error)
  const rpcResult = data as unknown as TicketingQuickTkRpcResult | null
  if (!rpcResult?.booking?.id || !rpcResult.transaction?.id) {
    return apiError('Ticketing returned an invalid save result.', 500)
  }

  const packageMatchStatus = rpcResult.packageMatch?.status
  const operationalStatus = rpcResult.transaction.operationalStatus
  if (
    !['held', 'issued'].includes(String(operationalStatus || '')) ||
    !['unmatched', 'matched', 'ambiguous'].includes(String(packageMatchStatus || ''))
  ) {
    return apiError('Ticketing returned an invalid save result.', 500)
  }

  const result: TicketingQuickTkResult = {
    bookingId: rpcResult.booking.id,
    transactionId: rpcResult.transaction.id,
    serviceType: 'TK',
    operationalStatus: operationalStatus as TicketingQuickTkResult['operationalStatus'],
    paymentStatus: 'unpaid',
    passengerCount: Number(rpcResult.transaction.passengerTicketCount || 0),
    packageMatchStatus: packageMatchStatus as TicketingQuickTkResult['packageMatchStatus'],
    idempotentReplay: rpcResult.idempotentReplay === true,
  }

  return apiOk(result, {
    status: result.idempotentReplay ? 200 : 201,
    ...PRIVATE_RESPONSE,
  })
}
