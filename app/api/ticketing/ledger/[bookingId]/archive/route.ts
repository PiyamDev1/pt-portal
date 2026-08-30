import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'
import { TICKET_ARCHIVE_COMMISSION_TOMBSTONE_CAPABILITY_VERSION } from '@/lib/ticketing/contracts'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

const archiveSchema = z
  .object({
    verificationCode: z.string().trim().min(1, 'Authentication code is required').max(100),
    verificationMethod: z.literal('auto').default('auto'),
  })
  .strict()

function isAdmin(role: string) {
  const normalized = role.trim().toLowerCase().replace(/[_-]+/g, ' ')
  return ADMIN_ROLES.some(
    (candidate) => candidate.trim().toLowerCase().replace(/[_-]+/g, ' ') === normalized,
  )
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> },
) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  if (!isAdmin(access.employee.role)) {
    return apiError('Agents must request deletion for an administrator to complete.', 403)
  }

  const rateLimit = await enforceRateLimit(request, {
    scope: 'ticketing.archive-booking',
    limit: 5,
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
  if (bodyError || !input) return apiError(bodyError || 'Authentication code is required.', 400)

  const verification = await verifyFreshSecondFactor({
    userId: access.user.id,
    code: input.verificationCode,
    method: input.verificationMethod,
  })
  if (!verification.verified) return apiError(verification.error || 'Verification failed.', 403)

  const supabase = getServiceSupabaseClient()
  const capability = await supabase.rpc('ticketing_schema_status')
  if (
    capability.error ||
    !hasTicketingSchemaCapability(
      capability.data,
      TICKET_ARCHIVE_COMMISSION_TOMBSTONE_CAPABILITY_VERSION,
    )
  ) {
    return apiError('Ticket archiving is not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_archive_booking', {
    p_actor_employee_id: access.employee.id,
    p_booking_id: bookingId,
    p_reason: null,
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
