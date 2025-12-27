import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { passportId, status, userId } = await request.json()

    if (!passportId || !status) {
      return NextResponse.json({ error: 'Missing passportId or status' }, { status: 400 })
    }

    // Guard: cannot mark as Collected until new passport number is recorded
    if (status === 'Collected') {
      const { data: existing, error: fetchErr } = await supabase
        .from('pakistani_passport_applications')
        .select('id,new_passport_number')
        .eq('id', passportId)
        .single()

      if (fetchErr) {
        console.error('[PAK Status Update] Fetch failed:', fetchErr.message)
        return NextResponse.json({ error: 'Failed to validate record' }, { status: 500 })
      }

      if (!existing?.new_passport_number) {
        return NextResponse.json(
          { error: 'Cannot mark as Collected until new passport number is recorded.' },
          { status: 400 }
        )
      }
    }

    const { error } = await supabase
      .from('pakistani_passport_applications')
      .update({
        status: status,
        employee_id: userId
      })
      .eq('id', passportId)

    if (error) throw error

    // Log to history table (works whether trigger exists or not)
    const { error: historyError } = await supabase
      .from('pakistani_passport_status_history')
      .insert({
        passport_application_id: passportId,
        new_status: status,
        changed_by: userId
      })

    if (historyError) {
      console.error('[PAK Status Update] History insert failed:', historyError.message)
      // Don't fail the whole request if history logging fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PAK Status Update] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
