import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { id, status } = await request.json()

    const { error } = await supabase.from('visa_applications').update({ status }).eq('id', id)

    if (error) throw new Error(error.message || 'Update failed')

    return apiOk({ updatedVisaId: id, status })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to update visa status'), 500)
  }
}
