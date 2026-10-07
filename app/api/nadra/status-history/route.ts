/**
 * API Route: NADRA Application Status History
 *
 * GET /api/nadra/status-history?nadraId=<id>
 *
 * Returns the chronological status change history for a NADRA application.
 * Each row includes the status, notes, timestamp, and the acting agent/user.
 *
 * Authentication: Authorized staff session; database access remains server-side.
 * Response Success (200): { history: StatusHistoryRow[] }
 * Response Errors: 400 Missing Nadra ID | 500 DB error
 */
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = getServiceSupabaseClient()

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
    const history = data.map((item) => {
      const employee = Array.isArray(item.employees) ? item.employees[0] : item.employees
      return {
        id: item.id,
        entryType: item.entry_type || 'status',
        status: item.new_status,
        complaintNumber: item.complaint_number || null,
        details: item.details || '',
        changed_by: employee?.full_name || 'System',
        date: item.changed_at,
      }
    })

    return apiOk({ history })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load NADRA status history'), 500)
  }
}
