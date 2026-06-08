import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

type SavedView = {
  name: string
  source: 'all' | 'portal' | 'whatsapp' | 'website'
  status: 'all' | 'pending' | 'confirmed' | 'completed' | 'cancelled'
  serviceId: string
  searchQuery: string
  showCancelled: boolean
}

function sanitizeSavedViews(input: unknown): SavedView[] {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      const candidate = item as Partial<SavedView>
      const name = String(candidate.name || '').trim()
      if (!name) return null
      return {
        name,
        source: candidate.source === 'portal' || candidate.source === 'whatsapp' || candidate.source === 'website' ? candidate.source : 'all',
        status:
          candidate.status === 'pending' ||
          candidate.status === 'confirmed' ||
          candidate.status === 'completed' ||
          candidate.status === 'cancelled'
            ? candidate.status
            : 'all',
        serviceId: String(candidate.serviceId || ''),
        searchQuery: String(candidate.searchQuery || ''),
        showCancelled: candidate.showCancelled !== false,
      }
    })
    .filter((item): item is SavedView => Boolean(item))
    .slice(0, 20)
}

export async function GET(request: NextRequest) {
  try {
    const locationId = request.nextUrl.searchParams.get('location_id')
    if (!locationId) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
    }

    const supabase = await getRouteSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data, error } = await supabase
      .from('booking_user_preferences')
      .select('saved_views')
      .eq('user_id', user.id)
      .eq('location_id', locationId)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ saved_views: sanitizeSavedViews(data?.saved_views) })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      location_id?: string
      saved_views?: unknown
    }

    if (!body.location_id) {
      return NextResponse.json({ error: 'location_id is required' }, { status: 400 })
    }

    const supabase = await getRouteSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const savedViews = sanitizeSavedViews(body.saved_views)
    const { data, error } = await supabase
      .from('booking_user_preferences')
      .upsert({
        user_id: user.id,
        location_id: body.location_id,
        saved_views: savedViews,
      }, { onConflict: 'user_id,location_id' })
      .select('saved_views')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, saved_views: sanitizeSavedViews(data?.saved_views) })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
