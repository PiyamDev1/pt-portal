/**
 * GET /api/passports/gb/status-history
 * Returns GB passport status transition history by passport record id.
 *
 * @module app/api/passports/gb/status-history
 */
import { z } from 'zod'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireStaffSession } from '@/lib/auth/staffSession'

const gbPassportHistoryQuerySchema = z.object({
  passportId: z.string().trim().max(200).optional(),
})

export async function GET(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const { searchParams } = new URL(request.url)
    const parsedQuery = gbPassportHistoryQuerySchema.safeParse({
      passportId: searchParams.get('passportId') ?? undefined,
    })
    if (!parsedQuery.success) {
      return apiError(parsedQuery.error.issues[0]?.message || 'Invalid query parameters', 400)
    }

    const { passportId } = parsedQuery.data
    if (!passportId) return apiOk({ history: [] })

    const supabase = getServiceSupabaseClient()
    const { data: history, error } = await supabase
      .from('british_passport_status_history')
      .select(
        `
        *,
        employees (full_name)
      `,
      )
      .eq('passport_id', passportId)
      .order('changed_at', { ascending: false })

    if (error) throw error

    return apiOk({ history })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load GB passport status history'), 500)
  }
}
