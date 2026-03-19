import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export async function POST(request) {
  try {
    // Use service role key to bypass RLS policies if necessary
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { nadraId, status, userId } = await request.json()

    if (!nadraId) {
      return apiError('Missing Nadra ID', 400)
    }

    const { error } = await supabase
      .from('nadra_services')
      .update({ status: status })
      .eq('id', nadraId)

    if (error) {
      throw new Error(error.message || 'Failed to update status')
    }

    // Insert status history record
    const { error: historyError } = await supabase.from('nadra_status_history').insert({
      nadra_service_id: nadraId,
      new_status: status,
      changed_by: userId,
      entry_type: 'status',
    })

    if (historyError) {
      throw new Error(historyError.message || 'Failed to insert status history')
    }

    return apiOk({ updatedNadraId: nadraId, status })
  } catch (error) {
    const errorMessage = toErrorMessage(error, 'Failed to update status')
    return apiError(errorMessage, 500)
  }
}
