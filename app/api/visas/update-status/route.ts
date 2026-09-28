/**
 * POST /api/visas/update-status
 * Updates status for a visa application by ID.
 *
 * @module app/api/visas/update-status
 */
import { z } from 'zod'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'

const updateVisaStatusSchema = z.object({
  id: z.string().trim().min(1, 'Visa ID is required').max(200),
  status: z.string().trim().min(1, 'Status is required').max(100),
})

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = getServiceSupabaseClient()
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      updateVisaStatusSchema,
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    const { id, status } = body
    const { error } = await supabase.from('visa_applications').update({ status }).eq('id', id)

    if (error) throw new Error(error.message || 'Update failed')

    return apiOk({ updatedVisaId: id, status })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update visa status'), 500)
  }
}
