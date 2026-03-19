/**
 * GET /api/visas/metadata
 * Returns visa countries and visa type metadata for form dropdowns.
 *
 * @module app/api/visas/metadata
 */

import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'

// Metadata doesn't change often - cache for 1 hour
export const revalidate = 3600

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

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
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    )
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load visa metadata'), 500)
  }
}
