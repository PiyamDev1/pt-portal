import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get('location_id')
  if (!locationId) {
    return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
  }

  const supabase = await getRouteSupabaseClient()
  const { data, error } = await supabase
    .from('booking_waitlist_entries')
    .select('*, booking_services:service_id(name)')
    .eq('location_id', locationId)
    .order('preferred_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ entries: data || [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const payload = {
    location_id: typeof body?.location_id === 'string' ? body.location_id : '',
    service_id: typeof body?.service_id === 'string' && body.service_id ? body.service_id : null,
    customer_name: typeof body?.customer_name === 'string' ? body.customer_name.trim() : '',
    customer_phone: typeof body?.customer_phone === 'string' ? body.customer_phone.trim() : '',
    customer_email: typeof body?.customer_email === 'string' ? body.customer_email.trim() || null : null,
    person_count: Math.max(1, Number(body?.person_count) || 1),
    preferred_date: typeof body?.preferred_date === 'string' ? body.preferred_date : null,
    preferred_time_start: typeof body?.preferred_time_start === 'string' ? body.preferred_time_start : null,
    preferred_time_end: typeof body?.preferred_time_end === 'string' ? body.preferred_time_end : null,
    source: body?.source === 'whatsapp' || body?.source === 'website' ? body.source : 'portal',
    notes: typeof body?.notes === 'string' ? body.notes.trim() || null : null,
    status: 'waiting',
  }

  if (!payload.location_id || !payload.customer_name || !payload.customer_phone) {
    return NextResponse.json({ error: 'location_id, customer_name, and customer_phone are required' }, { status: 400 })
  }

  const supabase = await getRouteSupabaseClient()
  const { data, error } = await supabase
    .from('booking_waitlist_entries')
    .insert(payload)
    .select('*, booking_services:service_id(name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, entry: data })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const entryId = typeof body?.id === 'string' ? body.id : ''
  if (!entryId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (typeof body?.status === 'string') updates.status = body.status
  if (typeof body?.notes === 'string' || body?.notes === null) updates.notes = body.notes
  if (typeof body?.linked_booking_id === 'string' || body?.linked_booking_id === null) updates.linked_booking_id = body.linked_booking_id

  const supabase = await getRouteSupabaseClient()
  const { data, error } = await supabase
    .from('booking_waitlist_entries')
    .update(updates)
    .eq('id', entryId)
    .select('*, booking_services:service_id(name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, entry: data })
}
