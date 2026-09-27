import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { loadApplicationSummary } from '@/lib/applications/summary.server'
import { requireStaffSession } from '@/lib/auth/staffSession'

export const dynamic = 'force-dynamic'

const PRIVATE_RESPONSE = {
  headers: { 'Cache-Control': 'private, no-store' },
} as const

export async function GET() {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = await getRouteSupabaseClient()
    return apiOk(await loadApplicationSummary(supabase), PRIVATE_RESPONSE)
  } catch {
    return apiError('Application summary failed', 500, {}, PRIVATE_RESPONSE)
  }
}
