import { Buffer } from 'node:buffer'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { type TicketingAttributionEmployee } from '@/lib/ticketing/attributionContracts'
import {
  ticketingQuickTkSchema,
  TICKET_UNPRICED_HELD_CAPABILITY_VERSION,
  type TicketingAirlineOption,
  type TicketingLedgerFare,
  type TicketingLedgerItem,
  type TicketingQuickTkResult,
} from '@/lib/ticketing/contracts'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { ticketingDetailsStatus } from '@/lib/ticketing/completionContracts'
import {
  hasTicketingSchemaCapability,
  normalizeTicketingSchemaStatus,
} from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const TICKETING_RUNTIME_VERSION = TICKET_UNPRICED_HELD_CAPABILITY_VERSION
const LEDGER_MAX_LIMIT = 100

const ledgerCursorSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    transactionId: z.string().uuid(),
    search: z.string().max(100),
  })
  .strict()

function parseLedgerQuery(request: NextRequest) {
  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 50)
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), LEDGER_MAX_LIMIT)
    : 50
  const search = (request.nextUrl.searchParams.get('search') || '').trim()
  if (search.length > 100) return null
  const rawCursor = request.nextUrl.searchParams.get('cursor')
  if (!rawCursor) return { limit, search, cursor: null }
  try {
    const parsed = ledgerCursorSchema.safeParse(
      JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')),
    )
    if (!parsed.success || parsed.data.search !== search) return null
    return { limit, search, cursor: parsed.data }
  } catch {
    return null
  }
}

function createLedgerCursor(row: TransactionRow, search: string) {
  return Buffer.from(
    JSON.stringify({ createdAt: row.created_at, transactionId: row.id, search }),
    'utf8',
  ).toString('base64url')
}

function escapeSearch(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

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

type EmployeeNameRow = {
  id: string
  full_name: string | null
}

type AttributionAssistantRow = {
  employee_id: string
  assistant_employee: Related<EmployeeNameRow>
}

type AttributionVersionRow = {
  attribution_version: number
  primary_employee_id: string
  responsible_employee: Related<EmployeeNameRow>
  ticket_booking_attribution_assistants: AttributionAssistantRow[] | null
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
  supplier_code: 'unknown' | 'sabre_polani' | 'amadeus_piyam' | 'sabre_bt' | 'ptap' | 'airline'
  supplier_name: string
  archived_at: string | null
  airlines: Related<AirlineRow>
  ticket_booking_attribution_versions: AttributionVersionRow[] | null
}

type FareRow = {
  passenger_type: 'ADT' | 'YTH' | 'CHD' | 'INF'
  quantity: number
  unit_supplier_cost_source: number | null
  unit_sale_price_source: number | null
  unit_gross_sale_price_source: number | null
  unit_discount_source: number | null
}

type PassengerRow = {
  passenger_type: 'ADT' | 'YTH' | 'CHD' | 'INF'
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
  pricingSource?: string
  idempotentReplay?: boolean
}

function firstRelated<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] || null : value
}

function airlineOption(row: AirlineRow): TicketingAirlineOption {
  return { id: row.id, iataCode: row.iata_code, name: row.name }
}

function attributionEmployee(row: EmployeeNameRow, fallbackName?: string) {
  const fullName = row.full_name?.trim() || fallbackName?.trim()
  return fullName ? ({ id: row.id, fullName } satisfies TicketingAttributionEmployee) : null
}

function canManageTicketingAttribution(role: string) {
  const normalizeRole = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, ' ')
  const normalizedRole = normalizeRole(role)
  return ADMIN_ROLES.some((allowedRole) => normalizeRole(allowedRole) === normalizedRole)
}

function currentAttribution(booking: BookingRow, actorEmployeeId: string, actorName: string) {
  const current = [...(booking.ticket_booking_attribution_versions || [])].sort(
    (left, right) => Number(right.attribution_version) - Number(left.attribution_version),
  )[0]
  const responsibleRow = current ? firstRelated(current.responsible_employee) : null
  if (!current || !responsibleRow) return null
  const responsibleEmployee = attributionEmployee(
    responsibleRow,
    responsibleRow.id === actorEmployeeId ? actorName : 'Staff member',
  )
  if (!responsibleEmployee) return null

  const assistantEmployees = (current.ticket_booking_attribution_assistants || [])
    .map((assistant) => firstRelated(assistant.assistant_employee))
    .filter((employee): employee is EmployeeNameRow => Boolean(employee))
    .map((employee) =>
      attributionEmployee(employee, employee.id === actorEmployeeId ? actorName : 'Staff member'),
    )
    .filter((employee): employee is TicketingAttributionEmployee => Boolean(employee))
    .sort(
      (left, right) =>
        left.fullName.localeCompare(right.fullName) || left.id.localeCompare(right.id),
    )

  return {
    responsibleEmployee,
    assistantEmployees,
    attributionVersion: Number(current.attribution_version),
  }
}

function ledgerItem(
  row: TransactionRow,
  actorEmployeeId: string,
  actorName: string,
): TicketingLedgerItem | null {
  const booking = firstRelated(row.ticket_bookings)
  const airline = booking ? firstRelated(booking.airlines) : null
  const attribution = booking ? currentAttribution(booking, actorEmployeeId, actorName) : null
  if (!booking || booking.archived_at || !airline || !attribution) return null

  const fares: TicketingLedgerFare[] = (row.ticket_passenger_fare_lines || []).map((fare) => ({
    passengerType: fare.passenger_type,
    quantity: fare.quantity,
    unitSupplierCost: fare.unit_supplier_cost_source,
    unitSalePrice: fare.unit_sale_price_source,
    unitGrossSalePrice: fare.unit_gross_sale_price_source,
    unitDiscount: fare.unit_discount_source,
  }))
  const passengers = (row.ticket_transaction_passengers || [])
    .map((allocation) => ({
      position: Number(allocation.position),
      passenger: firstRelated(allocation.ticket_passengers),
    }))
    .filter((entry): entry is { position: number; passenger: PassengerRow } =>
      Boolean(entry.passenger),
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
    supplier: { code: booking.supplier_code, name: booking.supplier_name },
    serviceType: row.service_type,
    operationalStatus: row.operational_status,
    paymentStatus: row.payment_status,
    bookingDate: row.booking_date,
    timeLimitAt: row.time_limit_at,
    issuedAt: row.issued_at,
    passengerCount: row.passenger_ticket_count,
    packageMatchStatus: booking.package_match_status,
    commissionScope: booking.commission_scope,
    detailsStatus:
      row.service_type === 'TK'
        ? ticketingDetailsStatus({
            contactPhone: booking.contact_phone,
            departureDate: booking.departure_date,
            fares,
            passengers,
          })
        : 'recorded',
    fares,
    createdAt: row.created_at,
    ...attribution,
    // Booking attribution identifies the root TK sale. A later DC/R-ER is a
    // separate commissionable fact and must never inherit the TK assistants.
    assistantEmployees: row.service_type === 'TK' ? attribution.assistantEmployees : [],
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
  const hint = String(error.hint || '')
  if (
    hint === 'TICKETING_IDEMPOTENCY_CONFLICT' ||
    (error.code === '22023' && /idempotency/i.test(message))
  ) {
    return apiError('This save key was already used for different ticket details.', 409, {
      code: 'IDEMPOTENCY_CONFLICT',
    })
  }
  if (hint === 'TICKETING_ATTRIBUTION_REASON_REQUIRED') {
    return apiError('A reason is required when changing ticket attribution.', 400, {
      code: 'ATTRIBUTION_REASON_REQUIRED',
    })
  }
  if (hint === 'TICKETING_STANDALONE_SALE_REQUIRED') {
    return apiError(
      'No package quotation price matched this PNR. Enter every standalone sale price.',
      400,
      { code: 'STANDALONE_SALE_REQUIRED' },
    )
  }
  if (error.code === '22023' && /employees? (?:is|are) invalid or inactive/i.test(message)) {
    return apiError('Select active employees for the responsible and assistant roles.', 400, {
      code: 'INVALID_ATTRIBUTION_EMPLOYEE',
    })
  }
  if (error.code === '42501') return apiError('Forbidden', 403)
  if (error.code === 'P0002') return apiError(message || 'Invalid ticket details', 400)
  if (error.code === '55000') {
    return apiError('This ticket could not be saved consistently. Refresh and try again.', 409, {
      code: 'TICKETING_STATE_CONFLICT',
    })
  }
  if (['22007', '22023', '23503', '23505', '23514'].includes(String(error.code || ''))) {
    return apiError('Invalid ticket details', 400)
  }
  if (['42P01', '42883'].includes(String(error.code || ''))) {
    return apiError('Ticketing quick entry is not installed on this database.', 503)
  }
  return apiError('Unable to save the ticket right now.', 500)
}

async function hasTicketingRuntimeCapability(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
) {
  const { data, error } = await supabase.rpc('ticketing_schema_status')
  if (error) {
    console.error('[ticketing] schema capability check failed', {
      code: error.code,
    })
    return false
  }
  const status = normalizeTicketingSchemaStatus(data)
  if (!status) {
    console.error('[ticketing] schema capability check returned an invalid result', {
      resultType: Array.isArray(data) ? 'array' : typeof data,
    })
    return false
  }
  if (!hasTicketingSchemaCapability(data, TICKETING_RUNTIME_VERSION)) {
    console.error('[ticketing] schema capability is not ready', {
      ready: status.ready,
      version: status.version,
      requiredVersion: TICKETING_RUNTIME_VERSION,
    })
    return false
  }
  return true
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const filters = parseLedgerQuery(request)
  if (!filters) return apiError('Invalid ticket ledger filters.', 400)
  const { limit, search, cursor } = filters
  const supabase = getServiceSupabaseClient()
  if (!(await hasTicketingRuntimeCapability(supabase))) {
    return apiError('Ticketing quick entry is not installed on this database.', 503)
  }

  const canManageAttribution = canManageTicketingAttribution(access.employee.role)
  let transactionsQuery = supabase.from('ticket_transactions').select(
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
            supplier_code,
            supplier_name,
            archived_at,
            airlines!inner(id, iata_code, name),
            ticket_booking_attribution_versions(
              attribution_version,
              primary_employee_id,
              responsible_employee:employees!ticket_booking_attribution_versions_primary_employee_id_fkey(
                id,
                full_name
              ),
              ticket_booking_attribution_assistants(
                employee_id,
                assistant_employee:employees!ticket_booking_attribution_assistants_employee_id_fkey(
                  id,
                  full_name
                )
              )
            )
          ),
          ticket_passenger_fare_lines(
            passenger_type,
            quantity,
            unit_supplier_cost_source,
            unit_sale_price_source,
            unit_gross_sale_price_source,
            unit_discount_source
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
  if (!canManageAttribution) {
    transactionsQuery = transactionsQuery.eq('owner_employee_id', access.employee.id)
  }
  if (search) {
    const escapedSearch = escapeSearch(search)
    transactionsQuery = transactionsQuery.or(
      `pnr.ilike.%${escapedSearch}%,customer_name.ilike.%${escapedSearch}%`,
      { foreignTable: 'ticket_bookings' },
    )
  }
  if (cursor) {
    transactionsQuery = transactionsQuery.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.transactionId})`,
    )
  }

  const attributionEmployeesPromise = supabase
    .from('employees')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  const [transactionsResult, airlinesResult, employeeResult, attributionEmployeesResult] =
    await Promise.all([
      transactionsQuery
        .is('ticket_bookings.archived_at', null)
        .order('created_at', { ascending: false })
        .limit(limit + 1),
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
      attributionEmployeesPromise,
    ])

  if (
    transactionsResult.error ||
    airlinesResult.error ||
    employeeResult.error ||
    attributionEmployeesResult.error
  ) {
    return apiError('Unable to load the ticket ledger right now.', 500)
  }

  const transactionRows = (transactionsResult.data || []) as unknown as TransactionRow[]
  const pageRows = transactionRows.slice(0, limit)
  const items = pageRows
    .map((row) => ledgerItem(row, access.employee.id, access.employee.fullName))
    .filter((item): item is TicketingLedgerItem => Boolean(item))
  const airlines = ((airlinesResult.data || []) as AirlineRow[]).map(airlineOption)
  const employee = employeeResult.data as unknown as EmployeeLocationRow | null
  const location = firstRelated(employee?.locations || null)
  const attributionEmployees = ((attributionEmployeesResult.data || []) as EmployeeNameRow[])
    .map((row) =>
      attributionEmployee(
        row,
        row.id === access.employee.id ? access.employee.fullName : undefined,
      ),
    )
    .filter((employee): employee is TicketingAttributionEmployee => Boolean(employee))

  return apiOk(
    {
      items,
      nextCursor:
        transactionRows.length > limit && pageRows.length > 0
          ? createLedgerCursor(pageRows[pageRows.length - 1], search)
          : null,
      airlines,
      context: {
        employeeId: access.employee.id,
        employeeName: access.employee.fullName,
        locationName: location?.name || null,
        timezone: location?.timezone || 'Europe/London',
        canManageAttribution,
        canManageRecords: canManageAttribution,
        attributionEmployees,
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

  const canManageAttribution = canManageTicketingAttribution(access.employee.role)
  const responsibleEmployeeId = entry.responsibleEmployeeId || access.employee.id
  const assistantEmployeeIds = entry.assistantEmployeeIds
  const responsibleEmployeeChanged = responsibleEmployeeId !== access.employee.id

  if (!canManageAttribution && responsibleEmployeeChanged) {
    return apiError('Only an administrator can assign a ticket to another employee.', 403)
  }
  if (assistantEmployeeIds.includes(responsibleEmployeeId)) {
    return apiError('The responsible employee cannot also be an assistant.', 400)
  }
  if (responsibleEmployeeChanged && !entry.attributionReason) {
    return apiError('A reason is required when changing ticket attribution.', 400)
  }

  const idempotencyKey = request.headers.get('idempotency-key')?.trim()
  if (!idempotencyKey || idempotencyKey.length > 200) {
    return apiError('A valid Idempotency-Key header is required.', 400)
  }

  const supabase = getServiceSupabaseClient()
  const { data, error } = await supabase.rpc('ticketing_create_quick_tk_supplied', {
    p_actor_employee_id: access.employee.id,
    p_idempotency_key: idempotencyKey,
    p_entry: {
      ...entry,
      responsibleEmployeeId,
      assistantEmployeeIds,
      attributionReason: responsibleEmployeeChanged ? entry.attributionReason : null,
    },
  })

  if (error) {
    console.error('[ticketing] quick entry RPC failed', {
      code: error.code,
    })
    return mutationError(error)
  }
  const rpcResult = data as unknown as TicketingQuickTkRpcResult | null
  if (!rpcResult?.booking?.id || !rpcResult.transaction?.id) {
    console.error('[ticketing] quick entry RPC returned an invalid result')
    return apiError('Ticketing returned an invalid save result.', 500)
  }

  const packageMatchStatus = rpcResult.packageMatch?.status
  const operationalStatus = rpcResult.transaction.operationalStatus
  const pricingSource = rpcResult.pricingSource
  if (
    !['held', 'issued'].includes(String(operationalStatus || '')) ||
    !['unmatched', 'matched', 'ambiguous'].includes(String(packageMatchStatus || '')) ||
    !['unpriced_held', 'ticketing_ledger', 'package_quote'].includes(String(pricingSource || ''))
  ) {
    console.error('[ticketing] quick entry RPC returned invalid ticket status data', {
      operationalStatus,
      packageMatchStatus,
      pricingSource,
    })
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
    pricingSource: pricingSource as TicketingQuickTkResult['pricingSource'],
    idempotentReplay: rpcResult.idempotentReplay === true,
  }

  return apiOk(result, {
    status: result.idempotentReplay ? 200 : 201,
    ...PRIVATE_RESPONSE,
  })
}
