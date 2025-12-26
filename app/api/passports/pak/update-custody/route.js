import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request) {
  const origin = request.headers.get('origin') || '*'

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const body = await request.json()
    const { passportId, action, newNumber, userId } = body

    if (!passportId || !action) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    if (action === 'return_old') {
      const { error: updError } = await supabase
        .from('pakistani_passport_applications')
        .update({
          is_old_passport_returned: true,
          old_passport_returned_at: new Date().toISOString(),
          old_passport_returned_by: userId
        })
        .eq('id', passportId)

      if (updError) throw updError

      // NOTE: Logging could be implemented to a separate table if available
      return NextResponse.json({ success: true }, { status: 200, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    if (action === 'record_new') {
      if (!newNumber) {
        return NextResponse.json({ error: 'New passport number required' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } })
      }

      const { error: updError } = await supabase
        .from('pakistani_passport_applications')
        .update({
          new_passport_number: newNumber.toUpperCase(),
          status: 'Completed'
        })
        .eq('id', passportId)

      if (updError) throw updError

      return NextResponse.json({ success: true }, { status: 200, headers: { 'Access-Control-Allow-Origin': origin } })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin } })

  } catch (error) {
    console.error('[PAK PASSPORT CUSTODY] Unexpected error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error.message
    }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin } })
  }
}
