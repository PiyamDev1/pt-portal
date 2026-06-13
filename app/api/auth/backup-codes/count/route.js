/**
 * API Route: Backup Code Count
 *
 * GET /api/auth/backup-codes/count
 *
 * Returns the number of unused backup codes for the authenticated user.
 * Returns { count: 0 } gracefully if the backup_codes table does not
 * exist yet (code 42P01), preventing crashes before migration is run.
 *
 * Authentication: Current session cookie
 * Response Errors: 401 Unauthorized | 500 DB error
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export const dynamic = 'force-dynamic'

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing Supabase credentials')
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(request) {
  try {
    const supabase = await getRouteSupabaseClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return apiError('Unauthorized', 401)

    const supabaseAdmin = getSupabaseAdmin()

    const { data, error } = await supabaseAdmin
      .from('backup_codes')
      .select('id')
      .eq('employee_id', user.id)
      .eq('used', false)

    if (error) {
      // Return 0 if table is missing (to prevent crashing before migration)
      if (error.code === '42P01') return apiOk({ count: 0 })
      return apiError(error.message, 500)
    }

    return apiOk({ count: (data || []).length }, { status: 200 })
  } catch (e) {
    return apiError(toErrorMessage(e, 'Failed to fetch backup code count'), 500)
  }
}
