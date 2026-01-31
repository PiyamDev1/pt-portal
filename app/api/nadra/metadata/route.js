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
    const [serviceTypes, serviceOptions, pricing] = await Promise.all([
      supabase.from('nadra_service_types').select('id, name').eq('is_active', true).order('name'),
      supabase.from('nadra_service_options').select('id, name, service_type_id').eq('is_active', true).order('name'),
      supabase.from('nadra_pricing').select(`
        id, 
        cost_price, 
        sale_price,
        nadra_service_types(name),
        nadra_service_options(name)
      `).eq('is_active', true)
    ])

    // Flatten pricing for easier frontend lookup
    const flatPricing = pricing.data?.map(p => ({
      id: p.id,
      cost: p.cost_price,
      price: p.sale_price,
      serviceType: p.nadra_service_types?.name,
      serviceOption: p.nadra_service_options?.name || null
    })) || []

    return NextResponse.json({
      serviceTypes: serviceTypes.data || [],
      serviceOptions: serviceOptions.data || [],
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
