import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { TICKET_ADMIN_REQUESTS_SUPPLIERS_API_CAPABILITY_VERSION } from '@/lib/ticketing/contracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const requestSchema = z
  .object({
    requestType: z.enum(['amendment', 'deletion']),
    requestNotes: z.string().trim().max(1000).nullable().optional().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.requestType === 'amendment' && !value.requestNotes) {
      context.addIssue({
        code: 'custom',
        path: ['requestNotes'],
        message: 'Describe the amendment the administrator should make.',
      })
    }
  })

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const limit = await enforceRateLimit(request, {
    scope: 'ticketing.change-request',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const bookingId = (await context.params).bookingId
  if (!z.string().uuid().safeParse(bookingId).success)
    return apiError('Invalid ticket booking.', 400)
  const { data: input, error: bodyError } = await parseBodyWithSchema(request, requestSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !input) return apiError(bodyError || 'Invalid change request.', 400)

  const supabase = getServiceSupabaseClient()
  const capability = await supabase.rpc('ticketing_schema_status')
  if (
    capability.error ||
    !hasTicketingSchemaCapability(
      capability.data,
      TICKET_ADMIN_REQUESTS_SUPPLIERS_API_CAPABILITY_VERSION,
    )
  ) {
    return apiError('Ticket change requests are not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_request_booking_change', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: bookingId,
    p_request_type: input.requestType,
    p_request_notes: input.requestType === 'deletion' ? null : input.requestNotes,
  })
  if (error) {
    if (error.code === '42501') return apiError('You cannot request a change to this ticket.', 403)
    if (error.code === 'P0002') return apiError('Ticket booking not found.', 404)
    if (['22023', '23514'].includes(String(error.code || ''))) {
      return apiError('Invalid ticket change request.', 400)
    }
    return apiError('Unable to submit the ticket change request right now.', 500)
  }
  const idempotentReplay =
    Boolean(data) && typeof data === 'object' && data !== null && 'idempotentReplay' in data
      ? data.idempotentReplay === true
      : false
  return apiOk(data, {
    status: idempotentReplay ? 200 : 201,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}
