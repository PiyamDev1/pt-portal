import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')

    if (!query || query.length < 2) return NextResponse.json({ results: [] })

    const { data, error } = await supabase
      .from('loan_customers')
      .select('id, first_name, last_name, phone_number, address')
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone_number.ilike.%${query}%`)
      .limit(5)

    if (error) throw error

    return NextResponse.json({ results: data })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
