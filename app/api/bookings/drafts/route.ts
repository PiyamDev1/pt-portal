import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export const runtime = 'nodejs'

const DEFAULT_DRAFT_KEY = 'appointment-form'

export async function GET(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get('location_id')
  const draftKey = request.nextUrl.searchParams.get('draft_key') || DEFAULT_DRAFT_KEY

  if (!locationId) {
    return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
  }

  const supabase = await getRouteSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('booking_drafts')
    .select('payload, updated_at')
    .eq('user_id', auth.user.id)
    .eq('location_id', locationId)
    .eq('draft_key', draftKey)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    payload: data?.payload || null,
    updated_at: data?.updated_at || null,
  })
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const locationId = typeof body?.location_id === 'string' ? body.location_id : ''
  const draftKey = typeof body?.draft_key === 'string' && body.draft_key.trim() ? body.draft_key.trim() : DEFAULT_DRAFT_KEY
  const payload = body?.payload

  if (!locationId || !payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'location_id and payload are required' }, { status: 400 })
  }

  const supabase = await getRouteSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('booking_drafts')
    .upsert({
      user_id: auth.user.id,
      location_id: locationId,
      draft_key: draftKey,
      payload,
    }, { onConflict: 'user_id,location_id,draft_key' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const locationId = request.nextUrl.searchParams.get('location_id')
  const draftKey = request.nextUrl.searchParams.get('draft_key') || DEFAULT_DRAFT_KEY

  if (!locationId) {
    return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
  }

  const supabase = await getRouteSupabaseClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('booking_drafts')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('location_id', locationId)
    .eq('draft_key', draftKey)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
