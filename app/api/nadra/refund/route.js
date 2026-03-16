import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { nadraId, userId } = await request.json()

    if (!nadraId) {
      return NextResponse.json({ error: 'Missing Nadra ID' }, { status: 400 })
    }

    const { data: current, error: fetchError } = await supabase
      .from('nadra_services')
      .select('id, status, is_refunded')
      .eq('id', nadraId)
      .single()

    if (fetchError || !current) {
      return NextResponse.json({ error: 'NADRA service not found' }, { status: 404 })
    }

    if (String(current.status || '').trim().toLowerCase() !== 'cancelled') {
      return NextResponse.json({ error: 'Only cancelled applications can be refunded' }, { status: 400 })
    }

    if (current.is_refunded) {
      return NextResponse.json({ success: true, alreadyRefunded: true })
    }

    const refundedAt = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('nadra_services')
      .update({ is_refunded: true, refunded_at: refundedAt })
      .eq('id', nadraId)

    if (updateError) throw updateError

    const { error: historyError } = await supabase
      .from('nadra_status_history')
      .insert({
        nadra_service_id: nadraId,
        new_status: current.status || 'Cancelled',
        changed_by: userId || null,
        entry_type: 'refund',
        details: 'Refund completed for cancelled application'
      })

    if (historyError) throw historyError

    return NextResponse.json({ success: true, refundedAt })
  } catch (error) {
    console.error('NADRA Refund Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
