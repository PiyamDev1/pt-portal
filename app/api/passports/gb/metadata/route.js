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
        service_type
      `)
    ])

    // Flatten pricing for easier frontend lookup
    const flatPricing = pricing.data?.map(p => ({
      id: p.id,
      cost: p.cost_price,
      price: p.sale_price,
      age: p.age_group,
      pages: p.pages,
      service: p.service_type
    })) || []

    return NextResponse.json({
      ages: ages.data || [],
      pages: pages.data || [],
      services: services.data || [],
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
