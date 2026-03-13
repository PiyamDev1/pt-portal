import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data, error } = await supabase
      .from('nadra_status_history')
      .select('nadra_service_id')
      .eq('entry_type', 'complaint')

    if (error) throw error

    const ids = [...new Set((data || []).map(r => r.nadra_service_id).filter(Boolean))]

    return NextResponse.json({ ids })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
