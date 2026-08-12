/**
 * API Route: NADRA Application Refund
 *
 * POST /api/nadra/refund
 *
 * Records a refund against a NADRA application and updates the refund
 * amount/date fields. Also appends a 'Refunded' status event to the
 * status history table.
 *
 * Request Body: { applicationId: string, refundAmount: number, refundDate: string }
 * Response Success (200): { refundedApplicationId }
 * Response Errors: 400 Missing fields | 500 DB error
 *
 * Authentication: Service role key
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { tryGenerateReceiptForStatusTrigger } from '@/lib/services/receiptGenerator'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

const refundSchema = z.object({
  nadraId: z.string({ error: 'Missing Nadra ID' }).trim().min(1, 'Missing Nadra ID').max(200),
})

export const dynamic = 'force-dynamic'

export async function POST(request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, refundSchema, {
      maxBytes: 4 * 1024,
    })
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)
    const { nadraId } = body
    const userId = access.user.id

    const { data: current, error: fetchError } = await supabase
      .from('nadra_services')
      .select('id, status, is_refunded')
      .eq('id', nadraId)
      .single()

    if (fetchError || !current) {
      return apiError('NADRA service not found', 404)
    }

    if (
      String(current.status || '')
        .trim()
        .toLowerCase() !== 'cancelled'
    ) {
      return apiError('Only cancelled applications can be refunded', 400)
    }

    if (current.is_refunded) {
      const refundedAt = new Date().toISOString()
      return apiOk({ refundedAt, alreadyRefunded: true })
    }

    const refundedAt = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('nadra_services')
      .update({ is_refunded: true, refunded_at: refundedAt })
      .eq('id', nadraId)

    if (updateError) throw new Error(updateError.message || 'Failed to update refund status')

    const { error: historyError } = await supabase.from('nadra_status_history').insert({
      nadra_service_id: nadraId,
      new_status: current.status || 'Cancelled',
      changed_by: userId || null,
      entry_type: 'refund',
      details: 'Refund completed for cancelled application',
    })

    if (historyError) throw new Error(historyError.message || 'Failed to insert refund history')

    await tryGenerateReceiptForStatusTrigger({
      serviceType: 'nadra',
      serviceRecordId: nadraId,
      status: current.status,
      isRefunded: true,
      generatedBy: userId || null,
    })

    return apiOk({ refundedAt })
  } catch (error) {
    const errorMessage = toErrorMessage(error, 'Failed to process refund')
    return apiError(errorMessage, 500)
  }
}
