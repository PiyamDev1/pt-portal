/**
 * API Route: Update NADRA Application Status
 *
 * POST /api/nadra/update-status
 *
 * Updates the processing status of a NADRA application and appends a row
 * to nadra_status_history.
 */
import { z } from 'zod'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { tryGenerateReceiptForStatusTrigger } from '@/lib/services/receiptGenerator'

const updateStatusSchema = z.object({
  nadraId: z.string({ error: 'Missing Nadra ID' }).trim().min(1, 'Missing Nadra ID').max(200),
  status: z.string().trim().min(1, 'Status is required').max(100),
})

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = getServiceSupabaseClient()
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      updateStatusSchema,
      { maxBytes: 8 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    const { nadraId, status } = body
    const userId = access.user.id
    const { error } = await supabase.from('nadra_services').update({ status }).eq('id', nadraId)

    if (error) throw new Error(error.message || 'Failed to update status')

    const { error: historyError } = await supabase.from('nadra_status_history').insert({
      nadra_service_id: nadraId,
      new_status: status,
      changed_by: userId,
      entry_type: 'status',
    })

    if (historyError) {
      throw new Error(historyError.message || 'Failed to insert status history')
    }

    await tryGenerateReceiptForStatusTrigger({
      serviceType: 'nadra',
      serviceRecordId: nadraId,
      status,
      generatedBy: userId || null,
    })

    return apiOk({ updatedNadraId: nadraId, status })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update status'), 500)
  }
}
