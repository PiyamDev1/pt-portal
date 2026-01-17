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
    const passportId = searchParams.get('passportId')

    if (!passportId) return NextResponse.json({ history: [] })

    // Fetch history logs
    const { data: history, error } = await supabase
      .from('british_passport_status_history')
      .select(`
        *,
        employees (full_name)
      `)
      .eq('passport_id', passportId)
      .order('changed_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ history })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
