/**
 * GET /api/passports/pak/status-history
 * Returns status transition history for Pakistani passport applications.
 *
 * @module app/api/passports/pak/status-history
 */

import { createClient } from '@supabase/supabase-js'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { searchParams } = new URL(request.url)
    const applicationId = searchParams.get('applicationId')
    const passportId = searchParams.get('passportId')

    // 1. Resolve to a specific Passport Record ID
    let targetPassportId = passportId

    if (!targetPassportId && applicationId) {
      // If we only have App ID, lookup the Passport ID
      const { data: link, error: linkError } = await supabase
        .from('pakistani_passport_applications')
        .select('id')
        .eq('application_id', applicationId) // Assumes you ran the migration to add application_id
        .single()

      if (linkError || !link) {
        // Fallback: Check if the application_id IS the passport_id (Old schema structure)
        // This handles the "Ghost Record" case or "Direct ID" case
        const { data: directCheck } = await supabase
          .from('pakistani_passport_applications')
          .select('id')
          .eq('id', applicationId)
          .single()

        if (directCheck) {
          targetPassportId = directCheck.id
        } else {
          return apiOk({ history: [] }) // Return empty instead of error to prevent UI crash
        }
      } else {
        targetPassportId = link.id
      }
    }

    if (!targetPassportId) {
      return apiError('Record not found', 404)
    }

    // 2. Fetch History
    const { data: history, error } = await supabase
      .from('pakistani_passport_status_history')
      .select(
        `
        id,
        new_status,
        changed_at,
        employees ( full_name )
      `,
      )
      .eq('passport_application_id', targetPassportId)
      .order('changed_at', { ascending: false })

    if (error) throw error

    // 3. Format
    const formattedHistory = history.map((item) => ({
      id: item.id,
      status: item.new_status,
      changed_by: item.employees?.full_name || 'System',
      date: item.changed_at,
      description: `Status changed to ${item.new_status}`,
    }))

    return apiOk({ history: formattedHistory })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load PK passport status history'), 500)
  }
}
