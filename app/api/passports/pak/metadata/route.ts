/**
 * API Route: Pakistani Passport Metadata
 *
 * GET /api/passports/pak/metadata
 *
 * Returns reference data for the Pakistani passport application form:
 * valid service types, processing categories, and assigned agents.
 * Response is cached privately for five minutes.
 *
 * Authentication: Authorized staff session; database access remains server-side.
 * Response Success (200): { categories, speeds, applicationTypes, pageCounts, pricing }
 * Response Errors: 500 DB error
 */
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'

export const dynamic = 'force-dynamic'

const REQUIRED_APPLICATION_TYPES = ['Lost']

function withRequiredApplicationTypes(rows: Array<{ name?: string | null }> | null | undefined) {
  const names = (rows || [])
    .map((item) => item.name)
    .filter((name): name is string => Boolean(name))
  for (const type of REQUIRED_APPLICATION_TYPES) {
    if (!names.includes(type)) {
      names.push(type)
    }
  }
  return names
}

export async function GET() {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  try {
    const supabase = getServiceSupabaseClient()

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
        applicationTypes: withRequiredApplicationTypes(applicationTypes.data),
        pageCounts: (pages.data || []).map((p) => p.option_label),
        pricing: flatPricing,
      },
      {
        headers: { 'Cache-Control': 'private, max-age=300' },
      },
    )
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load PK passport metadata'), 500)
  }
}
