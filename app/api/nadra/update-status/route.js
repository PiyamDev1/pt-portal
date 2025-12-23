import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    // Use service role key to bypass RLS policies if necessary
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { nadraId, status } = await request.json()

    if (!nadraId) {
      return NextResponse.json({ error: 'Missing Nadra ID' }, { status: 400 })
    }

    const { error } = await supabase
      .from('nadra_services')
      .update({ status: status })
      .eq('id', nadraId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Update Status Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
