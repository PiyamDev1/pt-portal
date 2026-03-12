import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const { nadraId, complaintNumber, details, userId } = await request.json()

    if (!nadraId) {
      return NextResponse.json({ error: 'Missing Nadra ID' }, { status: 400 })
    }

    if (!complaintNumber || !String(complaintNumber).trim()) {
      return NextResponse.json({ error: 'Complaint number is required' }, { status: 400 })
    }

    if (!details || !String(details).trim()) {
      return NextResponse.json({ error: 'Complaint details are required' }, { status: 400 })
    }

    const { data: nadraService, error: nadraError } = await supabase
      .from('nadra_services')
      .select('id, status')
      .eq('id', nadraId)
      .single()

    if (nadraError || !nadraService) {
      return NextResponse.json({ error: 'NADRA service not found' }, { status: 404 })
    }

    const { error: historyError } = await supabase
      .from('nadra_status_history')
      .insert({
        nadra_service_id: nadraId,
        new_status: nadraService.status || 'In Progress',
        changed_by: userId,
        entry_type: 'complaint',
        complaint_number: String(complaintNumber).trim(),
        details: String(details).trim(),
      })

    if (historyError) throw historyError

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Complaint Record Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}