/**
 * POST /api/integrations/frappe/reconcile
 *
 * Initial reconcile endpoint returns unresolved conflict summary.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireMaintenanceSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await requireMaintenanceSession()
  if (!session.authorized) {
    return session.response
  }

  try {
    const supabase = getSupabaseClient()
    const { data, error, count } = await supabase
      .from('integration_conflicts')
      .select('id, domain, entity_id, status, created_at', { count: 'exact' })
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      throw error
    }

    return apiOk({
      ok: true,
      openConflictCount: count || 0,
      conflicts: data || [],
    })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Reconcile failed'), 500)
  }
}
