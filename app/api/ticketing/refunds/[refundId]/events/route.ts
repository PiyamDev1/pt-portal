import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import {
  TICKET_REFUND_CAPABILITY_VERSION,
  ticketingAppendRefundEventSchema,
} from '@/lib/ticketing/refundContracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

function privateError(message: string, status: number) {
  return apiError(message, status, {}, PRIVATE_RESPONSE)
}

function normalizeRole(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ')
}

function canManageRefunds(role: string) {
  const normalized = normalizeRole(role)
  return ADMIN_ROLES.some((allowed) => normalizeRole(allowed) === normalized)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ refundId: string }> },
) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  if (!canManageRefunds(access.employee.role)) return privateError('Forbidden', 403)

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.refund-event',
    limit: 60,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { refundId } = await context.params
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(refundId)
  ) {
    return privateError('Invalid Refund.', 400)
  }
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() || ''
  if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
    return privateError('A valid Idempotency-Key header is required.', 400)
  }
  const { data: input, error: bodyError } = await parseBodyWithSchema(
    request,
    ticketingAppendRefundEventSchema,
    { maxBytes: 16 * 1024 },
  )
  if (bodyError || !input) return privateError(bodyError || 'Invalid refund event.', 400)

  const supabase = getServiceSupabaseClient()
  const capability = await supabase.rpc('ticketing_schema_status')
  if (
    capability.error ||
    !hasTicketingSchemaCapability(capability.data, TICKET_REFUND_CAPABILITY_VERSION)
  ) {
    return privateError('Saved Refunds are not installed.', 503)
  }

  const result = await supabase.rpc('ticketing_append_refund_event_2026082903', {
    p_actor_employee_id: access.employee.id,
    p_refund_id: refundId,
    p_expected_version: input.expectedVersion,
    p_event_type: input.eventType,
    p_amount_gbp: input.amountGbp,
    p_event_date: input.eventDate,
    p_reference: input.reference,
    p_notes: input.notes,
    p_override_reason: input.overrideReason,
    p_idempotency_key: idempotencyKey,
  })
  if (result.error) {
    if (result.error.code === '42501') return privateError('Forbidden', 403)
    if (result.error.code === 'P0002') return privateError('Refund not found.', 404)
    if (
      result.error.hint === 'TICKETING_REFUND_VERSION_CONFLICT' ||
      result.error.code === '40001'
    ) {
      return privateError('This Refund changed. Refresh before saving another event.', 409)
    }
    if (['22007', '22023', '23503', '23505', '23514', '55000'].includes(result.error.code || '')) {
      return privateError('Invalid refund event.', 400)
    }
    return privateError('Unable to update this Refund.', 500)
  }
  return apiOk(result.data, PRIVATE_RESPONSE)
}
