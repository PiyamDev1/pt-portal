import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { nadraId, userId } = await request.json()

    if (!nadraId) {
      return apiError('Missing Nadra ID', 400)
    }

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

    return apiOk({ refundedAt })
  } catch (error) {
    const errorMessage = toErrorMessage(error, 'Failed to process refund')
    return apiError(errorMessage, 500)
  }
}
