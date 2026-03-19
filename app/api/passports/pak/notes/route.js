/**
 * GET/POST /api/passports/pak/notes
 * Reads and updates notes attached to Pakistani passport applications.
 *
 * @module app/api/passports/pak/notes
 */

import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

function getSupabaseClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function toClientError(error) {
  const message = error?.message || 'Database error'
  if (message.includes('column') && message.includes('notes')) {
    return 'Database migration required: add notes column to pakistani_passport_applications.'
  }
  return message
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get('applicationId')

    if (!applicationId) {
      return apiError('applicationId is required', 400)
    }

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('pakistani_passport_applications')
      .select('id, notes')
      .eq('application_id', applicationId)
      .maybeSingle()

    if (error) {
      return apiError(toClientError(error), 500)
    }

    if (!data) {
      return apiOk({ notes: '' })
    }

    return apiOk({ notes: data.notes || '' })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Unexpected error'), 500)
  }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { applicationId, notes, userId } = body || {}

    if (!applicationId) {
      return apiError('applicationId is required', 400)
    }

    if (typeof notes !== 'string') {
      return apiError('notes must be a string', 400)
    }

    const normalizedNotes = notes.trim() || null

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('pakistani_passport_applications')
      .update({
        notes: normalizedNotes,
        employee_id: userId,
      })
      .eq('application_id', applicationId)
      .select('id, notes')
      .maybeSingle()

    if (error) {
      return apiError(toClientError(error), 500)
    }

    if (!data) {
      return apiError('Passport application record not found', 404)
    }

    return apiOk({ updatedPassportId: data.id, notes: data.notes || '' })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Unexpected error'), 500)
  }
}
