/**
 * GET /api/passports/gb/metadata
 * Returns GB passport lookup data and pricing matrix for form dropdowns.
 *
 * @module app/api/passports/gb/metadata
 */

import { createClient } from '@supabase/supabase-js'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

function normalisePricingText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalisePageValue(value) {
  const text = String(value || '').trim()
  const numeric = text.match(/\d+/)?.[0]
  return numeric || normalisePricingText(text)
}

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

    // Fetch all lookup tables and the pricing matrix
    const [ages, pages, services, pricing] = await Promise.all([
      supabase.from('gb_passport_ages').select('id, name').order('name'),
      supabase.from('gb_passport_pages').select('id, option_label').order('option_label'),
      supabase.from('gb_passport_services').select('id, name').order('name'),
      supabase.from('gb_passport_pricing').select(`
        id,
        cost_price,
        sale_price,
        age_group,
        pages,
        service_type,
        is_active
      `),
    ])

    const errors = [ages.error, pages.error, services.error, pricing.error].filter(Boolean)
    if (errors.length > 0) throw errors[0]

    // Flatten pricing for easier frontend lookup
    const flatPricing =
      pricing.data
        ?.filter((p) => p.is_active !== false)
        .map((p) => ({
          id: p.id,
          cost: p.cost_price,
          price: p.sale_price,
          age: p.age_group,
          pages: p.pages,
          service: p.service_type,
          ageKey: normalisePricingText(p.age_group),
          pagesKey: normalisePageValue(p.pages),
          serviceKey: normalisePricingText(p.service_type),
        })) || []

    return apiOk(
      {
        ages: ages.data || [],
        pages: pages.data || [],
        services: services.data || [],
        pricing: flatPricing,
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load GB passport metadata'), 500)
  }
}
