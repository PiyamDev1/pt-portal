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
    const gbPassportId = searchParams.get('gbPassportId')

    if (!gbPassportId) {
      return NextResponse.json({ error: 'Missing gbPassportId' }, { status: 400 })
    }

    // Get status history for this GB passport, ordered by newest first
    const { data: history, error: historyError } = await supabase
      .from('british_passport_status_history')
      .select('*')
      .eq('passport_id', gbPassportId)
      .order('created_at', { ascending: false })

    if (historyError) {
      console.error('Supabase error:', historyError)
      // Return empty history if table doesn't exist or no data
      return NextResponse.json({ history: [] })
    }

    return NextResponse.json({ history: history || [] })
  } catch (error) {
    console.error('History fetch error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
