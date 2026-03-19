/**
 * API Route: Seed Service Categories
 *
 * POST /api/lms/seed-service-categories
 *
 * One-time setup route that inserts the default set of loan/service categories
 * (e.g. Travel Loan, Emergency Advance) into the loan_service_categories table.
 * Skips existing entries to allow safe re-runs. Should be called once after
 * initial database migration.
 *
 * Authentication: Service role key (internal admin use only)
 * Response Errors: 500 Supabase not configured | 500 DB insert failed
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return apiError(
        'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local',
        500,
      )
    }
    const supabase = createClient(url, key)

    const categories = ['nadra', 'passport', 'ticket', 'umrah', 'hotels', 'visa']

    // Normalize existing names to lowercase
    const { data: existing, error: fetchErr } = await supabase
      .from('loan_service_categories')
      .select('id, name')
    if (fetchErr) throw new Error(fetchErr.message || 'Failed to fetch existing service categories')

    if (existing && existing.length > 0) {
      for (const c of existing) {
        const lower = (c.name || '').toLowerCase()
        if (c.name !== lower) {
          const { error: updateErr } = await supabase
            .from('loan_service_categories')
            .update({ name: lower })
            .eq('id', c.id)
          if (updateErr) throw new Error(updateErr.message || 'Failed to normalize service category')
        }
      }
    }

    // Upsert categories by name (lowercase)
    const toUpsert = categories.map((name) => ({ name }))
    const { error } = await supabase
      .from('loan_service_categories')
      .upsert(toUpsert, { onConflict: 'name' })

    if (error) throw new Error(error.message || 'Failed to upsert service categories')

    const { data } = await supabase.from('loan_service_categories').select('id, name').order('name')

    return apiOk({ categories: data || [] })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to seed service categories'), 500)
  }
}
