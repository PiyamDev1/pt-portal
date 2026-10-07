/**
 * GET /api/visas/metadata
 * Returns visa countries and visa type metadata for form dropdowns.
 * Authentication: Authorized staff session; database access remains server-side.
 * Response: { countries, types }
 *
 * @module app/api/visas/metadata
 */

import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = getServiceSupabaseClient()

    const [countries, types] = await Promise.all([
      // Fetch all countries (used for BOTH Nationality list and Destination list)
      supabase.from('visa_countries').select('id, name').order('name'),

      // Fetch types with nationality rules
      supabase
        .from('visa_types')
        .select(
          'id, name, default_cost, default_price, default_validity, country_id, allowed_nationalities',
        )
        .order('name'),
    ])

    return apiOk(
      {
        countries: countries.data || [],
        types: types.data || [],
      },
      {
        headers: { 'Cache-Control': 'private, max-age=300' },
      },
    )
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load visa metadata'), 500)
  }
}
