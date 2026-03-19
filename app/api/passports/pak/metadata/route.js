/**
 * API Route: Pakistani Passport Metadata
 *
 * GET /api/passports/pak/metadata
 *
 * Returns reference data for the Pakistani passport application form:
 * valid service types, processing categories, and assigned agents.
 * Response is cached for 1 hour (revalidate = 3600).
 *
 * Authentication: Service role key
 * Response Success (200): { serviceTypes, categories, agents }
 * Response Errors: 500 DB error
 */
import { createClient } from '@supabase/supabase-js'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

// Metadata doesn't change often - cache for 1 hour
export const revalidate = 3600

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    // Fetch all lookup tables and the pricing matrix
    const [categories, speeds, applicationTypes, pages, pricing] = await Promise.all([
      supabase.from('pk_passport_categories').select('name').eq('is_active', true).order('name'),
      supabase.from('pk_passport_speeds').select('name').eq('is_active', true).order('name'),
      supabase
        .from('pk_passport_application_types')
        .select('name')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('pk_passport_pages')
        .select('option_label')
        .eq('is_active', true)
        .order('option_label'),
      supabase
        .from('pk_passport_pricing')
        .select(
          `
        id,
        category,
        speed,
        application_type,
        pages,
        cost_price,
        sale_price
      `,
        )
        .eq('is_active', true),
    ])

    // Flatten pricing for easier frontend lookup
    const flatPricing =
      pricing.data?.map((p) => ({
        id: p.id,
        cost: p.cost_price,
        price: p.sale_price,
        category: p.category,
        speed: p.speed,
        applicationType: p.application_type,
        pages: p.pages,
      })) || []

    return apiOk(
      {
        categories: (categories.data || []).map((c) => c.name),
        speeds: (speeds.data || []).map((s) => s.name),
        applicationTypes: (applicationTypes.data || []).map((t) => t.name),
        pageCounts: (pages.data || []).map((p) => p.option_label),
        pricing: flatPricing,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      },
    )
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load PK passport metadata'), 500)
  }
}
