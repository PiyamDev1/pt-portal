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

    const { error } = await supabase
      .from('pakistani_passport_applications')
      .update({
        status: status,
        employee_id: userId
      })
      .eq('id', passportId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PAK Status Update] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
