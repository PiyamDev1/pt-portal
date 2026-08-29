import { Buffer } from 'node:buffer'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import {
  TICKET_REFUND_CAPABILITY_VERSION,
  TICKET_REFUND_FORMULA_VERSION,
  TICKET_REFUND_STATUSES,
  ticketingRecordRefundSchema,
  type TicketingRefundItem,
  type TicketingRefundStatus,
} from '@/lib/ticketing/refundContracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const
const MAX_PAGE_SIZE = 100

function privateError(message: string, status: number) {
  return apiError(message, status, {}, PRIVATE_RESPONSE)
}

const querySchema = z
  .object({
    pnr: z
      .string()
      .trim()
      .min(1)
      .max(20)
      .transform((value) => value.toUpperCase().replace(/\s+/g, ''))
      .optional(),
    status: z.enum(TICKET_REFUND_STATUSES).optional(),
    limit: z
      .string()
      .regex(/^[1-9]\d{0,2}$/)
      .transform(Number)
      .optional(),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,1024}$/)
      .optional(),
  })
  .strict()
  .refine((value) => !value.limit || value.limit <= MAX_PAGE_SIZE)

const cursorSchema = z
  .object({
    createdAt: z.string().datetime({ offset: true }),
    id: z.string().uuid(),
    pnr: z.string(),
    status: z.string(),
  })
  .strict()

type Related<T> = T | T[] | null
type NameRow = { id: string; full_name: string | null }
type AirlineRow = { id: string; iata_code: string; name: string }
type RefundRow = {
  id: string
  booking_id: string
  pnr: string
  ticket_number: string
  passenger_name: string | null
  passenger_type: TicketingRefundItem['passengerType']
  settlement_mode: 'refund' | 'replacement'
  package_match_status: TicketingRefundItem['packageMatchStatus']
  commission_scope: TicketingRefundItem['commissionScope']
  original_sale_price_gbp: string | number
  proposed_cancellation_charge_gbp: string | number
  proposed_customer_refund_gbp: string | number
  expected_airline_recovery_gbp: string | number
  expected_company_result_gbp: string | number
  customer_settled_gbp: string | number
  airline_recovered_gbp: string | number
  other_actual_costs_gbp: string | number
  airline_recovery_final: boolean
  actual_company_result_gbp: string | number | null
  status: TicketingRefundStatus
  version: string | number
  notes: string | null
  created_at: string
  airlines: Related<AirlineRow>
  owner_employee: Related<NameRow>
}

function first<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function canManageRefunds(role: string) {
  const normalized = normalizeRole(role)
  return ADMIN_ROLES.some((allowed) => normalizeRole(allowed) === normalized)
}

function parseCursor(value: string | undefined, pnr: string, status: string) {
  if (!value) return null
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString()))
    return parsed.success && parsed.data.pnr === pnr && parsed.data.status === status
      ? parsed.data
      : undefined
  } catch {
    return undefined
  }
}

function createCursor(row: RefundRow, pnr: string, status: string) {
  return Buffer.from(
    JSON.stringify({ createdAt: row.created_at, id: row.id, pnr, status }),
  ).toString('base64url')
}

function mapRefund(row: RefundRow): TicketingRefundItem | null {
  const airline = first(row.airlines)
  const owner = first(row.owner_employee)
  if (!airline || !owner?.full_name) return null
  return {
    id: row.id,
    bookingId: row.booking_id,
    pnr: row.pnr,
    ticketNumber: row.ticket_number,
    passengerName: row.passenger_name,
    passengerType: row.passenger_type,
    airline: { id: airline.id, iataCode: airline.iata_code, name: airline.name },
    owner: { id: owner.id, fullName: owner.full_name },
    settlementMode: row.settlement_mode,
    packageMatchStatus: row.package_match_status,
    commissionScope: row.commission_scope,
    originalSalePriceGbp: row.original_sale_price_gbp,
    proposedCancellationChargeGbp: row.proposed_cancellation_charge_gbp,
    proposedCustomerRefundGbp: row.proposed_customer_refund_gbp,
    expectedAirlineRecoveryGbp: row.expected_airline_recovery_gbp,
    expectedCompanyResultGbp: row.expected_company_result_gbp,
    customerSettledGbp: row.customer_settled_gbp,
    airlineRecoveredGbp: row.airline_recovered_gbp,
    otherActualCostsGbp: row.other_actual_costs_gbp,
    airlineRecoveryFinal: row.airline_recovery_final,
    actualCompanyResultGbp: row.actual_company_result_gbp,
    status: row.status,
    version: Number(row.version),
    notes: row.notes,
    createdAt: row.created_at,
  }
}

async function hasCapability(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const result = await supabase.rpc('ticketing_schema_status')
  return (
    !result.error && hasTicketingSchemaCapability(result.data, TICKET_REFUND_CAPABILITY_VERSION)
  )
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const keys = [...request.nextUrl.searchParams.keys()]
  if (keys.length !== new Set(keys).size) return privateError('Invalid refund filters.', 400)
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return privateError('Invalid refund filters.', 400)
  const { pnr = '', status = '', limit = 50 } = parsed.data
  const cursor = parseCursor(parsed.data.cursor, pnr, status)
  if (cursor === undefined) return privateError('Restart the refund search.', 400)

  const supabase = getServiceSupabaseClient()
  if (!(await hasCapability(supabase))) return privateError('Saved Refunds are not installed.', 503)

  let query = supabase.from('ticket_refunds').select(`
    id, booking_id, pnr, ticket_number, passenger_name, passenger_type,
    settlement_mode, package_match_status, commission_scope,
    original_sale_price_gbp, proposed_cancellation_charge_gbp,
    proposed_customer_refund_gbp, expected_airline_recovery_gbp,
    expected_company_result_gbp, customer_settled_gbp, airline_recovered_gbp,
    other_actual_costs_gbp, airline_recovery_final, actual_company_result_gbp,
    status, version, notes, created_at,
    airlines!inner(id, iata_code, name),
    owner_employee:employees!ticket_refunds_owner_employee_id_fkey(id, full_name)
  `)
  if (!canManageRefunds(access.employee.role)) {
    query = query.eq('owner_employee_id', access.employee.id)
  }
  if (pnr) query = query.eq('pnr', pnr)
  if (status) query = query.eq('status', status)
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    )
  }
  const result = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (result.error) return privateError('Unable to load saved Refunds.', 500)

  const rows = (result.data || []) as unknown as RefundRow[]
  const pageRows = rows.slice(0, limit)
  const items = pageRows.map(mapRefund)
  if (items.some((item) => item === null)) {
    return privateError('Unable to load saved Refunds safely.', 500)
  }
  return apiOk(
    {
      items,
      context: { canManage: canManageRefunds(access.employee.role) },
      nextCursor:
        rows.length > limit && pageRows.length > 0
          ? createCursor(pageRows[pageRows.length - 1], pnr, status)
          : null,
    },
    PRIVATE_RESPONSE,
  )
}

export async function POST(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.refund-record',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() || ''
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }
  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingRecordRefundSchema,
    { maxBytes: 24 * 1024 },
  )
  if (bodyError || !input) return privateError(bodyError || 'Invalid refund details.', 400)

  const replacement = input.replacement
  const supabase = getServiceSupabaseClient()
  if (!(await hasCapability(supabase))) return privateError('Saved Refunds are not installed.', 503)
  const result = await supabase.rpc('ticketing_record_refund_2026082903', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: input.bookingId,
    p_passenger_type: input.passengerType,
    p_passenger_position: input.passengerPosition,
    p_settlement_mode: input.settlementMode,
    p_replacement_booking_id: replacement?.source === 'ledger' ? replacement.bookingId : null,
    p_replacement_passenger_type:
      replacement?.source === 'ledger' ? replacement.passengerType : null,
    p_replacement_passenger_position:
      replacement?.source === 'ledger' ? replacement.passengerPosition : null,
    p_manual_replacement_supplier_cost_gbp:
      replacement?.source === 'manual' ? replacement.supplierCostGbp : null,
    p_manual_replacement_sale_price_gbp:
      replacement?.source === 'manual' ? replacement.salePriceGbp : null,
    p_airline_cancellation_fee_gbp: input.airlineCancellationFeeGbp,
    p_supplier_cancellation_charge_gbp: input.supplierCancellationChargeGbp,
    p_retained_agent_commission_gbp: input.retainedAgentCommissionGbp,
    p_desired_company_markup_gbp: input.desiredCompanyMarkupGbp,
    p_replacement_agent_commission_gbp: replacement?.agentCommissionGbp ?? null,
    p_replacement_desired_markup_gbp: replacement?.desiredMarkupGbp ?? null,
    p_formula_version: TICKET_REFUND_FORMULA_VERSION,
    p_notes: input.notes,
    p_override_reason: input.overrideReason,
    p_idempotency_key: idempotencyKey,
  })
  if (result.error) {
    if (result.error.code === '42501') {
      if (result.error.hint === 'TICKETING_REFUND_OVERRIDE_REQUIRED') {
        return privateError('Manager/Admin approval and an override reason are required.', 403)
      }
      return privateError('Forbidden', 403)
    }
    if (result.error.hint === 'TICKETING_REFUND_EXISTS') {
      return privateError('An active refund already exists for this passenger ticket.', 409)
    }
    if (result.error.code === 'P0002') return privateError('Passenger ticket not found.', 404)
    if (['22007', '22023', '23503', '23505', '23514'].includes(result.error.code || '')) {
      return privateError('Invalid refund details.', 400)
    }
    return privateError('Unable to save this Refund.', 500)
  }
  return apiOk(result.data, { status: 201, ...PRIVATE_RESPONSE })
}
