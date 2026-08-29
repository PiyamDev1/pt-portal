import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'

const reviewSchema = z.object({ status: z.enum(['fulfilled', 'rejected']) }).strict()

function isAdmin(role: string) {
  const normalized = role.trim().toLowerCase().replace(/[_-]+/g, ' ')
  return ADMIN_ROLES.some(
    (candidate) => candidate.trim().toLowerCase().replace(/[_-]+/g, ' ') === normalized,
  )
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ requestId: string }> },
) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  if (!isAdmin(access.employee.role)) return apiError('Forbidden', 403)
  const requestId = (await context.params).requestId
  if (!z.string().uuid().safeParse(requestId).success) return apiError('Invalid request.', 400)
  const { data: input, error: bodyError } = await parseBodyWithSchema(request, reviewSchema, {
    maxBytes: 1024,
  })
  if (bodyError || !input) return apiError(bodyError || 'Invalid review.', 400)

  const supabase = getServiceSupabaseClient()
  const { data, error } = await supabase.rpc('ticketing_review_booking_change', {
    p_actor_employee_id: access.employee.id,
    p_request_id: requestId,
    p_status: input.status,
  })
  if (error) {
    if (error.code === 'P0002') return apiError('Change request not found.', 404)
    if (error.code === '42501') return apiError('Forbidden', 403)
    return apiError('Unable to update the change request.', 500)
  }
  return apiOk(data, { headers: { 'Cache-Control': 'private, no-store' } })
}
