/**
 * GET /api/passports/pak/status-history
 * Returns status transition history for Pakistani passport applications.
 *
 * @module app/api/passports/pak/status-history
 */
import { z } from 'zod'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'

const pakPassportHistoryQuerySchema = z.object({
  applicationId: z.string().trim().max(200).optional(),
  passportId: z.string().trim().max(200).optional(),
})

export async function GET(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { searchParams } = new URL(request.url)
    const parsedQuery = pakPassportHistoryQuerySchema.safeParse({
      applicationId: searchParams.get('applicationId') ?? undefined,
      passportId: searchParams.get('passportId') ?? undefined,
    })
    if (!parsedQuery.success) {
      return apiError(parsedQuery.error.issues[0]?.message || 'Invalid query parameters', 400)
    }

    const { applicationId } = parsedQuery.data
    let targetPassportId = parsedQuery.data.passportId
    const supabase = getServiceSupabaseClient()

    if (!targetPassportId && applicationId) {
      const { data: link, error: linkError } = await supabase
        .from('pakistani_passport_applications')
        .select('id')
        .eq('application_id', applicationId)
        .single()

      if (linkError || !link) {
        // Older records may use the application ID as their passport record ID.
        const { data: directCheck } = await supabase
          .from('pakistani_passport_applications')
          .select('id')
          .eq('id', applicationId)
          .single()

        if (directCheck) {
          targetPassportId = directCheck.id
        } else {
          return apiOk({ history: [] })
        }
      } else {
        targetPassportId = link.id
      }
    }

    if (!targetPassportId) return apiError('Record not found', 404)

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

    const formattedHistory = (history || []).map((item) => {
      const employee = Array.isArray(item.employees) ? item.employees[0] : item.employees
      return {
        id: item.id,
        status: item.new_status,
        changed_by: employee?.full_name || 'System',
        date: item.changed_at,
        description: `Status changed to ${item.new_status}`,
      }
    })

    return apiOk({ history: formattedHistory })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load PK passport status history'), 500)
  }
}
