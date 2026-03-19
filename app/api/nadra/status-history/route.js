/**
 * API Route: NADRA Application Status History
 *
 * GET /api/nadra/status-history?applicationId=<id>
 *
 * Returns the chronological status change history for a NADRA application.
 * Each row includes the status, notes, timestamp, and the acting agent/user.
 *
 * Authentication: Service role key
 * Response Success (200): { history: StatusHistoryRow[] }
 * Response Errors: 400 Missing applicationId | 500 DB error
 */
import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    const { searchParams } = new URL(request.url)
    const nadraId = searchParams.get('nadraId')

    if (!nadraId) {
      return apiError('Missing Nadra ID', 400)
    }

    const { data, error } = await supabase
      .from('nadra_status_history')
      .select(
        `
        id,
        entry_type,
        new_status,
        complaint_number,
        details,
        changed_at,
        employees ( full_name )
      `,
      )
      .eq('nadra_service_id', nadraId)
      .order('changed_at', { ascending: false })

    if (error) throw error

    // Map 'new_status' to 'status' for easier frontend usage
    const history = data.map((item) => ({
      id: item.id,
      entryType: item.entry_type || 'status',
      status: item.new_status,
      complaintNumber: item.complaint_number || null,
      details: item.details || '',
      changed_by: item.employees?.full_name || 'System',
      date: item.changed_at,
    }))

    return apiOk({ history })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load NADRA status history'), 500)
  }
}
