/**
 * API Route: Backup Code Count
 *
 * GET /api/auth/backup-codes/count?userId=<id>
 *
 * Returns the number of unused backup codes for a given user.
 * Returns { count: 0 } gracefully if the backup_codes table does not
 * exist yet (code 42P01), preventing crashes before migration is run.
 *
 * Authentication: Service role key
 * Response Errors: 400 Missing userId | 500 DB error
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

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
    const supabaseAdmin = getSupabaseAdmin()

    // FIX: Use standard URL parsing to avoid 500 errors
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) return apiError('userId required', 400)

    const { data, error } = await supabaseAdmin
      .from('backup_codes')
      .select('id')
      .eq('employee_id', userId)
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
