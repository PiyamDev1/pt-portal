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

async function resolvePassportRecord(supabase, applicationId, passportId) {
  const normalizedPassportId = String(passportId || '').trim()
  const normalizedApplicationId = String(applicationId || '').trim()

  if (normalizedPassportId) {
    const { data, error } = await supabase
      .from('pakistani_passport_applications')
      .select('id, notes, application_id')
      .eq('id', normalizedPassportId)
      .maybeSingle()

    if (error) {
      return { error }
    }

    if (data) {
      return { data }
    }
  }

  if (!normalizedApplicationId) {
    return { data: null }
  }

  const { data, error } = await supabase
    .from('pakistani_passport_applications')
    .select('id, notes, application_id')
    .eq('application_id', normalizedApplicationId)
    .maybeSingle()

  if (error) {
    return { error }
  }

  return { data }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get('applicationId')
    const passportId = searchParams.get('passportId')

    if (!applicationId && !passportId) {
      return apiError('applicationId or passportId is required', 400)
    }

    const supabase = getSupabaseClient()
    const { data, error } = await resolvePassportRecord(supabase, applicationId, passportId)

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
    const { applicationId, passportId, notes, userId } = body || {}

    if (!applicationId && !passportId) {
      return apiError('applicationId or passportId is required', 400)
    }

    if (typeof notes !== 'string') {
      return apiError('notes must be a string', 400)
    }

    const normalizedNotes = notes.trim() || null

    const supabase = getSupabaseClient()
    const { data: existingRecord, error: lookupError } = await resolvePassportRecord(
      supabase,
      applicationId,
      passportId,
    )

    if (lookupError) {
      return apiError(toClientError(lookupError), 500)
    }

    if (!existingRecord?.id) {
      return apiError('Passport application record not found', 404)
    }

    const { data, error } = await supabase
      .from('pakistani_passport_applications')
      .update({
        notes: normalizedNotes,
        employee_id: userId,
      })
      .eq('id', existingRecord.id)
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
