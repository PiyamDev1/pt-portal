import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { TICKET_YOUTH_ASSISTANCE_ARCHIVE_CAPABILITY_VERSION } from '@/lib/ticketing/contracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const archiveSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.archive-booking',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
  })
  if (!rateLimit.allowed) return rateLimit.response

  const { bookingId } = await context.params
  if (!z.string().uuid().safeParse(bookingId).success)
    return apiError('Invalid ticket booking.', 400)
  const { data: input, error: bodyError } = await parseBodyWithSchema(request, archiveSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !input) return apiError(bodyError || 'An archive reason is required.', 400)

  const supabase = getServiceSupabaseClient()
  const capability = await supabase.rpc('ticketing_schema_status')
  if (
    capability.error ||
    !hasTicketingSchemaCapability(
      capability.data,
      TICKET_YOUTH_ASSISTANCE_ARCHIVE_CAPABILITY_VERSION,
    )
  ) {
    return apiError('Ticket archiving is not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_archive_booking', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: bookingId,
    p_reason: input.reason,
  })
  if (error) {
    if (error.code === '42501') return apiError('You cannot archive this ticket.', 403)
    if (error.code === 'P0002') return apiError('Ticket booking not found.', 404)
    if (['22023', '23514'].includes(String(error.code || ''))) {
      return apiError('Invalid archive request.', 400)
    }
    console.error('[ticketing] archive booking RPC failed', { code: error.code })
    return apiError('Unable to archive the ticket right now.', 500)
  }

  return apiOk(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
