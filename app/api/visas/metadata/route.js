import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const [{ data: countries }, { data: types }] = await Promise.all([
      supabase.from('visa_countries').select('id, name').order('name'),
      supabase.from('visa_types').select('id, name').order('name')
    ])

    return NextResponse.json({
      countries: countries || [],
      types: types || []
    })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
