import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { nadraId, status, userId } = await request.json()

    const { error } = await supabase
      .from('nadra_services')
      .update({ status: status })
      .eq('id', nadraId)

    if (error) throw error

    // Log status change in history table
    const { error: historyError } = await supabase
      .from('nadra_status_history')
      .insert({
        nadra_service_id: nadraId,
        status,
        changed_by: userId
      })

    if (historyError) throw historyError

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
