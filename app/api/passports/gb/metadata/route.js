/**
 * GET /api/passports/gb/metadata
 * Returns GB passport lookup data and pricing matrix for form dropdowns.
 *
 * @module app/api/passports/gb/metadata
 */

import { createClient } from '@supabase/supabase-js'
import { apiOk, apiError } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { requireStaffSession } from '@/lib/auth/staffSession'
import {
  mapGbPricingRule,
  normaliseGbPageValue,
  normaliseGbPricingText,
} from '@/lib/passports/gbPricing'

export const dynamic = 'force-dynamic'

function mergeLookupOptions(lookupRows, pricingRows, lookupLabelKey, pricingLabelKey, normalise) {
  const merged = []
  const seen = new Set()

  for (const row of lookupRows || []) {
    const label = row?.[lookupLabelKey]
    const key = normalise(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push(row)
  }

  for (const row of pricingRows || []) {
    const label = row?.[pricingLabelKey]
    const key = normalise(label)
    if (!key || seen.has(key)) continue
    seen.add(key)
    merged.push({ id: `pricing-${pricingLabelKey}-${key}`, [lookupLabelKey]: label })
  }

  return merged
}

export async function GET() {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

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

    const activePricingRows = (pricing.data || []).filter((p) => p.is_active !== false)

    // Flatten pricing for easier frontend lookup and merge active pricing labels
    // into the dropdowns so the pricing table remains the source of truth.
    const flatPricing = activePricingRows.map(mapGbPricingRule)

    return apiOk(
      {
        ages: mergeLookupOptions(
          ages.data,
          activePricingRows,
          'name',
          'age_group',
          normaliseGbPricingText,
        ),
        pages: mergeLookupOptions(
          pages.data,
          activePricingRows,
          'option_label',
          'pages',
          normaliseGbPageValue,
        ),
        services: mergeLookupOptions(
          services.data,
          activePricingRows,
          'name',
          'service_type',
          normaliseGbPricingText,
        ),
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
