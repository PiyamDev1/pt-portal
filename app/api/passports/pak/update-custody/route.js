import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  const origin = request.headers.get('origin') || '*'

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const body = await request.json()
    const { passportId, action, newNumber, userId } = body

    if (!passportId || !action) {
      return apiError('Missing fields', 400)
    }

    if (action === 'return_old') {
      const { error: updError } = await supabase
        .from('pakistani_passport_applications')
        .update({
          is_old_passport_returned: true,
          old_passport_returned_at: new Date().toISOString(),
          old_passport_returned_by: userId,
        })
        .eq('id', passportId)

      if (updError) throw updError

      // NOTE: Logging could be implemented to a separate table if available
      return apiOk(
        { updatedPassportId: passportId, action: 'return_old' },
        { status: 200, headers: { 'Access-Control-Allow-Origin': origin } },
      )
    }

    if (action === 'record_new') {
      if (!newNumber) {
        return apiError('New passport number required', 400)
      }

      const { error: updError } = await supabase
        .from('pakistani_passport_applications')
        .update({
          new_passport_number: newNumber.toUpperCase(),
          status: 'Completed',
        })
        .eq('id', passportId)

      if (updError) throw updError

      return apiOk(
        {
          updatedPassportId: passportId,
          action: 'record_new',
          newPassportNumber: newNumber.toUpperCase(),
        },
        { status: 200, headers: { 'Access-Control-Allow-Origin': origin } },
      )
    }

    if (action === 'toggle_fingerprints') {
      // Get current status
      const { data: current } = await supabase
        .from('pakistani_passport_applications')
        .select('fingerprints_completed')
        .eq('id', passportId)
        .single()

      if (!current) {
        return apiError('Passport record not found', 404)
      }

      const { error: updError } = await supabase
        .from('pakistani_passport_applications')
        .update({
          fingerprints_completed: !current.fingerprints_completed,
        })
        .eq('id', passportId)

      if (updError) throw updError

      return apiOk(
        {
          updatedPassportId: passportId,
          action: 'toggle_fingerprints',
          fingerprints_completed: !current.fingerprints_completed,
        },
        { status: 200, headers: { 'Access-Control-Allow-Origin': origin } },
      )
    }

    return apiError('Unknown action', 400)
  } catch (error) {
    return apiError('Internal server error', 500, { details: toErrorMessage(error, 'Unexpected error') })
  }
}
