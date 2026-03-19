/**
 * GET /api/passports/gb/status-history
 * Returns GB passport status transition history by passport record id.
 *
 * @module app/api/passports/gb/status-history
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
    const passportId = searchParams.get('passportId')

    if (!passportId) return apiOk({ history: [] })

    // Fetch history logs
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
