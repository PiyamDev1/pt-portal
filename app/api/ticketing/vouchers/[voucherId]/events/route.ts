import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'
import {
  TICKET_VOUCHER_CAPABILITY_VERSION,
  ticketingAppendVoucherEventSchema,
  type TicketingVoucherEventItem,
} from '@/lib/ticketing/voucherContracts'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

function privateError(message: string, status: number) {
  return apiError(message, status, {}, PRIVATE_RESPONSE)
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function isAdmin(role: string) {
  const normalized = normalizeRole(role)
  return ADMIN_ROLES.some((allowed) => normalizeRole(allowed) === normalized)
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function ready(supabase: ReturnType<typeof getServiceSupabaseClient>) {
  const capability = await supabase.rpc('ticketing_schema_status')
  return (
    !capability.error &&
    hasTicketingSchemaCapability(capability.data, TICKET_VOUCHER_CAPABILITY_VERSION)
  )
}

type VoucherScopeRow = {
  owner_employee_id: string
  follow_up_employee_id: string
}

async function canSeeVoucher(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  voucherId: string,
  employeeId: string,
  role: string,
) {
  if (isAdmin(role)) return true
  const result = await supabase
    .from('ticket_vouchers')
    .select('owner_employee_id, follow_up_employee_id')
    .eq('id', voucherId)
    .maybeSingle()
  if (result.error || !result.data) return false
  const voucher = result.data as VoucherScopeRow
  return voucher.owner_employee_id === employeeId || voucher.follow_up_employee_id === employeeId
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ voucherId: string }> },
) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  const { voucherId } = await context.params
  if (!validUuid(voucherId)) return privateError('Invalid Ticket Voucher.', 400)

  const supabase = getServiceSupabaseClient()
  if (!(await ready(supabase)))
    return privateError('Ticket Voucher lifecycle is not installed.', 503)
  if (!(await canSeeVoucher(supabase, voucherId, access.employee.id, access.employee.role))) {
    return privateError('Ticket Voucher not found.', 404)
  }

  const result = await supabase
    .from('ticket_voucher_events')
    .select(
      `
      id, event_type, linked_booking_id, linked_transaction_passenger_id, refund_id,
      amount_gbp, event_date, notes, event_data, created_at,
      actor:employees!ticket_voucher_events_actor_employee_id_fkey(id, full_name)
    `,
    )
    .eq('voucher_id', voucherId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(250)
  if (result.error) return privateError('Unable to load Ticket Voucher history.', 500)

  const items = (result.data || []).map((row) => {
    const actorValue = row.actor as unknown
    const actor = (Array.isArray(actorValue) ? actorValue[0] : actorValue) as {
      id?: string
      full_name?: string | null
    } | null
    if (!actor?.id || !actor.full_name) return null
    return {
      id: row.id,
      eventType: row.event_type,
      actor: { id: actor.id, fullName: actor.full_name },
      linkedBookingId: row.linked_booking_id,
      linkedTransactionPassengerId: row.linked_transaction_passenger_id,
      refundId: row.refund_id,
      amountGbp: row.amount_gbp,
      eventDate: row.event_date,
      notes: row.notes,
      eventData: row.event_data,
      createdAt: row.created_at,
    } satisfies TicketingVoucherEventItem
  })
  if (items.some((item) => item === null)) {
    return privateError('Unable to load Ticket Voucher history safely.', 500)
  }
  return apiOk({ items }, PRIVATE_RESPONSE)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ voucherId: string }> },
) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.voucher-event',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { voucherId } = await context.params
  if (!validUuid(voucherId)) return privateError('Invalid Ticket Voucher.', 400)
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() || ''
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }
  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingAppendVoucherEventSchema,
    { maxBytes: 20 * 1024 },
  )
  if (bodyError || !input) return privateError(bodyError || 'Invalid voucher event.', 400)
  if (input.eventType !== 'claim_submitted' && !isAdmin(access.employee.role)) {
    return privateError('Only an administrator may confirm or allocate voucher value.', 403)
  }

  const supabase = getServiceSupabaseClient()
  if (!(await ready(supabase)))
    return privateError('Ticket Voucher lifecycle is not installed.', 503)
  const result = await supabase.rpc('ticketing_append_voucher_event_2026082903', {
    p_actor_employee_id: access.employee.id,
    p_voucher_id: voucherId,
    p_expected_version: input.expectedVersion,
    p_event_type: input.eventType,
    p_amount_gbp: input.amountGbp,
    p_event_date: input.eventDate,
    p_linked_booking_id: input.linkedBookingId,
    p_linked_passenger_type: input.linkedPassengerType,
    p_linked_passenger_position: input.linkedPassengerPosition,
    p_refund_id: input.refundId,
    p_airline_reference: input.airlineReference,
    p_notes: input.notes,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey,
  })
  if (result.error) {
    if (result.error.code === '42501') return privateError('Forbidden', 403)
    if (result.error.code === 'P0002') return privateError('Ticket Voucher not found.', 404)
    if (
      result.error.hint === 'TICKETING_VOUCHER_VERSION_CONFLICT' ||
      result.error.code === '40001'
    ) {
      return privateError('This Ticket Voucher changed. Refresh before saving.', 409)
    }
    if (result.error.hint === 'TICKETING_VOUCHER_AIRLINE_MISMATCH') {
      return privateError('Airline credit can only be used on a ticket from the same airline.', 409)
    }
    if (['22007', '22023', '23503', '23505', '23514', '55000'].includes(result.error.code || '')) {
      return privateError('Invalid voucher event.', 400)
    }
    return privateError('Unable to update this Ticket Voucher.', 500)
  }
  return apiOk(result.data, PRIVATE_RESPONSE)
}
