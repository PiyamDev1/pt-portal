import { Buffer } from 'node:buffer'
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'
import {
  TICKET_VOUCHER_CAPABILITY_VERSION,
  TICKET_VOUCHER_STATUSES,
  ticketingCreateVoucherSchema,
  type TicketingVoucherItem,
  type TicketingVoucherStatus,
} from '@/lib/ticketing/voucherContracts'

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
    status: z.enum(TICKET_VOUCHER_STATUSES).optional(),
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
    claimByDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    id: z.string().uuid(),
    pnr: z.string(),
    status: z.string(),
  })
  .strict()

type Related<T> = T | T[] | null
type NameRow = { id: string; full_name: string | null }
type AirlineRow = { id: string; iata_code: string; name: string }
type VoucherRow = {
  id: string
  booking_id: string
  pnr: string
  ticket_number: string
  passenger_name: string | null
  passenger_type: TicketingVoucherItem['passengerType']
  issue_date: string
  cancellation_date: string
  claim_by_date: string
  status: TicketingVoucherStatus
  confirmed_value_gbp: string | number | null
  remaining_value_gbp: string | number | null
  airline_reference: string | null
  notes: string | null
  version: number
  created_at: string
  airlines: Related<AirlineRow>
  owner_employee: Related<NameRow>
  follow_up_employee: Related<NameRow>
}

function first<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function canManageVouchers(role: string) {
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

function createCursor(row: VoucherRow, pnr: string, status: string) {
  return Buffer.from(
    JSON.stringify({ claimByDate: row.claim_by_date, id: row.id, pnr, status }),
  ).toString('base64url')
}

function mapVoucher(row: VoucherRow): TicketingVoucherItem | null {
  const airline = first(row.airlines)
  const owner = first(row.owner_employee)
  const followUp = first(row.follow_up_employee)
  if (!airline || !owner?.full_name || !followUp?.full_name) return null
  return {
    id: row.id,
    bookingId: row.booking_id,
    pnr: row.pnr,
    ticketNumber: row.ticket_number,
    passengerName: row.passenger_name,
    passengerType: row.passenger_type,
    airline: { id: airline.id, iataCode: airline.iata_code, name: airline.name },
    owner: { id: owner.id, fullName: owner.full_name },
    followUpOwner: { id: followUp.id, fullName: followUp.full_name },
    issueDate: row.issue_date,
    cancellationDate: row.cancellation_date,
    claimByDate: row.claim_by_date,
    status: row.status,
    confirmedValueGbp: row.confirmed_value_gbp,
    remainingValueGbp: row.remaining_value_gbp,
    airlineReference: row.airline_reference,
    notes: row.notes,
    version: Number(row.version),
    createdAt: row.created_at,
  }
}

async function hasCapability(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const result = await supabase.rpc('ticketing_schema_status')
  return (
    !result.error && hasTicketingSchemaCapability(result.data, TICKET_VOUCHER_CAPABILITY_VERSION)
  )
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const raw = Object.fromEntries(request.nextUrl.searchParams)
  if (
    [...request.nextUrl.searchParams.keys()].length !==
    new Set(request.nextUrl.searchParams.keys()).size
  ) {
    return privateError('Invalid voucher filters.', 400)
  }
  const parsed = querySchema.safeParse(raw)
  if (!parsed.success) return privateError('Invalid voucher filters.', 400)
  const { pnr = '', status = '', limit = 50 } = parsed.data
  const cursor = parseCursor(parsed.data.cursor, pnr, status)
  if (cursor === undefined) return privateError('Restart the voucher search.', 400)

  const supabase = getServiceSupabaseClient()
  if (!(await hasCapability(supabase))) {
    return privateError('Ticket Vouchers are not installed.', 503)
  }

  let query = supabase.from('ticket_vouchers').select(`
    id, booking_id, pnr, ticket_number, passenger_name, passenger_type, issue_date,
    cancellation_date, claim_by_date, status, confirmed_value_gbp, remaining_value_gbp,
    airline_reference, notes, version, created_at,
    airlines!inner(id, iata_code, name),
    owner_employee:employees!ticket_vouchers_owner_employee_id_fkey(id, full_name),
    follow_up_employee:employees!ticket_vouchers_follow_up_employee_id_fkey(id, full_name)
  `)
  if (!canManageVouchers(access.employee.role)) {
    query = query.or(
      `owner_employee_id.eq.${access.employee.id},follow_up_employee_id.eq.${access.employee.id}`,
    )
  }
  if (pnr) query = query.eq('pnr', pnr)
  if (status) query = query.eq('status', status)
  if (cursor) {
    query = query.or(
      `claim_by_date.gt.${cursor.claimByDate},and(claim_by_date.eq.${cursor.claimByDate},id.gt.${cursor.id})`,
    )
  }
  const result = await query
    .order('claim_by_date', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)
  if (result.error) return privateError('Unable to load Ticket Vouchers.', 500)

  const rows = (result.data || []) as unknown as VoucherRow[]
  const pageRows = rows.slice(0, limit)
  const items = pageRows.map(mapVoucher)
  if (items.some((item) => item === null)) {
    return privateError('Unable to load Ticket Vouchers safely.', 500)
  }
  return apiOk(
    {
      items,
      context: { canManage: canManageVouchers(access.employee.role) },
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
    scope: 'ticketing.voucher-create',
    limit: 40,
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
    ticketingCreateVoucherSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !input) return privateError(bodyError || 'Invalid voucher details.', 400)

  const supabase = getServiceSupabaseClient()
  if (!(await hasCapability(supabase))) {
    return privateError('Ticket Vouchers are not installed.', 503)
  }
  const result = await supabase.rpc('ticketing_create_voucher_2026082901', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: input.bookingId,
    p_passenger_type: input.passengerType,
    p_passenger_position: input.passengerPosition,
    p_follow_up_employee_id: input.followUpEmployeeId || null,
    p_cancellation_date: input.cancellationDate,
    p_claim_by_date: input.claimByDate || null,
    p_airline_reference: input.airlineReference,
    p_notes: input.notes,
    p_idempotency_key: idempotencyKey,
  })
  if (result.error) {
    if (result.error.code === '42501') return privateError('Forbidden', 403)
    if (result.error.hint === 'TICKETING_VOUCHER_EXISTS') {
      return privateError('A voucher already exists for this passenger ticket.', 409)
    }
    if (result.error.code === 'P0002') {
      return privateError('Issued passenger ticket not found.', 404)
    }
    if (['22007', '22023', '23503', '23505', '23514'].includes(result.error.code || '')) {
      return privateError('Invalid voucher details.', 400)
    }
    return privateError('Unable to create the Ticket Voucher.', 500)
  }
  return apiOk(result.data, { status: 201, ...PRIVATE_RESPONSE })
}
