import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const nadraId = searchParams.get('nadraId')
    if (!nadraId) {
      return NextResponse.json({ error: 'nadraId is required' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { data, error } = await supabase
      .from('nadra_status_history')
      .select('id, status, changed_by, changed_at')
      .eq('nadra_service_id', nadraId)
      .order('changed_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ items: data || [] })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
