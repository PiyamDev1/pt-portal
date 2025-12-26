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

    if (!passportId) {
      return NextResponse.json({ error: 'Missing Passport ID' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('pakistani_passport_status_history')
      .select(`
        id,
        new_status,
        changed_at,
        employees ( full_name )
      `)
      .eq('passport_application_id', passportId)
      .order('changed_at', { ascending: false })

    if (error) throw error

    // Format for Frontend
    const history = data.map(item => ({
      id: item.id,
      status: item.new_status,
      changed_by: item.employees?.full_name || 'System',
      date: item.changed_at
    }))

    return NextResponse.json({ history })

  } catch (error) {
    console.error('History Fetch Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
