/**
 * API Route: Seed Service Categories
 *
 * POST /api/lms/seed-service-categories
 *
 * One-time setup route that inserts the default set of loan/service categories
 * into the loan_service_categories table. Existing entries are normalized and
 * the endpoint can be safely re-run after initial database migration.
 *
 * Authentication: LMS maintenance session; database access uses the server-only service client.
 */
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireLmsMaintenance } from '@/lib/lms/apiAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'

const DEFAULT_SERVICE_CATEGORIES = ['nadra', 'passport', 'ticket', 'umrah', 'hotels', 'visa']

export async function POST(request: Request): Promise<Response> {
  try {
    const access = await requireLmsMaintenance()
    if (!access.authorized) return access.response

    const limit = await enforceRateLimit(request, {
      scope: 'lms.seed-service-categories',
      limit: 3,
      windowSeconds: 60 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return apiError(
        'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
        500,
      )
    }

    const supabase = getServiceSupabaseClient()

    const { data: existing, error: fetchError } = await supabase
      .from('loan_service_categories')
      .select('id, name')
    if (fetchError) {
      throw new Error(fetchError.message || 'Failed to fetch existing service categories')
    }

    if (existing && existing.length > 0) {
      for (const category of existing) {
        const lower = (category.name || '').toLowerCase()
        if (category.name !== lower) {
          const { error: updateError } = await supabase
            .from('loan_service_categories')
            .update({ name: lower })
            .eq('id', category.id)
          if (updateError) {
            throw new Error(updateError.message || 'Failed to normalize service category')
          }
        }
      }
    }

    const { error: upsertError } = await supabase.from('loan_service_categories').upsert(
      DEFAULT_SERVICE_CATEGORIES.map((name) => ({ name })),
      { onConflict: 'name' },
    )

    if (upsertError) throw new Error(upsertError.message || 'Failed to upsert service categories')

    const { data: categories } = await supabase
      .from('loan_service_categories')
      .select('id, name')
      .order('name')

    return apiOk({ categories: categories || [] })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to seed service categories'), 500)
  }
}
