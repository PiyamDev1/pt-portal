import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const [countries, types] = await Promise.all([
      // Fetch countries sorted alphabetically
      supabase.from('visa_countries').select('id, name, code').order('name'),
      // Fetch types with their country_id and default_validity
      supabase
        .from('visa_types')
        .select('id, name, default_cost, default_price, default_validity, country_id')
        .order('name')
    ])

    return NextResponse.json({
      countries: countries.data || [],
      types: types.data || []
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
