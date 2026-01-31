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

    const [countries, types] = await Promise.all([
      // Fetch all countries (used for BOTH Nationality list and Destination list)
      supabase.from('visa_countries').select('id, name').order('name'),
      
      // Fetch types with nationality rules
      supabase.from('visa_types').select('id, name, default_cost, default_price, default_validity, country_id, allowed_nationalities').order('name')
    ])

    return NextResponse.json({
      countries: countries.data || [],
      types: types.data || []
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      }
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
