import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { id, status, notes, userId } = await request.json()

    // 1. Get current status for history
    const { data: current } = await supabase
        .from('british_passport_applications')
        .select('status')
        .eq('id', id)
        .single()

    // 2. Update Record
    const { error } = await supabase
        .from('british_passport_applications')
        .update({ status: status })
        .eq('id', id)

    if (error) throw error

    // 3. Log History (with Notes)
    await supabase.from('british_passport_status_history').insert({
        passport_id: id,
        old_status: current?.status,
        new_status: status,
        notes: notes || null,
        changed_by: userId
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
