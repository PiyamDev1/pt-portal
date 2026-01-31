import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Metadata doesn't change often - cache for 1 hour
export const revalidate = 3600

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Fetch all lookup tables and the pricing matrix
    const [categories, speeds, applicationTypes, pricing] = await Promise.all([
      supabase.from('pk_passport_categories').select('id, name').eq('is_active', true).order('name'),
      supabase.from('pk_passport_speeds').select('id, name').eq('is_active', true).order('name'),
      supabase.from('pk_passport_application_types').select('id, name').eq('is_active', true).order('name'),
      supabase.from('pk_passport_pricing').select(`
        id, 
        cost_price, 
        sale_price,
        pk_passport_categories(name),
        pk_passport_speeds(name),
        pk_passport_application_types(name)
      `).eq('is_active', true)
    ])

    // Flatten pricing for easier frontend lookup
    const flatPricing = pricing.data?.map(p => ({
      id: p.id,
      cost: p.cost_price,
      price: p.sale_price,
      category: p.pk_passport_categories?.name,
      speed: p.pk_passport_speeds?.name,
      applicationType: p.pk_passport_application_types?.name
    })) || []

    return NextResponse.json({
      categories: categories.data || [],
      speeds: speeds.data || [],
      applicationTypes: applicationTypes.data || [],
      pricing: flatPricing
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      }
    })

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
