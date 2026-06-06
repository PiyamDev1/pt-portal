import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const locationId = searchParams.get('location_id')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 })
    }

    const supabase = await getRouteSupabaseClient()
    let query = supabase
      .from('bookings')
      .select('id,status,source,service_id,updated_at,start_time,booking_services:service_id(name)')
      .gte('start_time', from)
      .lt('start_time', to)

    if (locationId) {
      query = query.eq('location_id', locationId)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const bookings = data || []
    const byStatus = bookings.reduce<Record<string, number>>((acc, booking) => {
      acc[booking.status] = (acc[booking.status] || 0) + 1
      return acc
    }, {})
    const bySource = bookings.reduce<Record<string, number>>((acc, booking) => {
      acc[booking.source] = (acc[booking.source] || 0) + 1
      return acc
    }, {})
    const byService = bookings.reduce<Record<string, number>>((acc, booking) => {
      const key = (booking.booking_services as { name?: string } | null)?.name || 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const recentThreshold = Date.now() - 24 * 60 * 60 * 1000
    const recentlyModified = bookings.filter((booking) => {
      const updatedAt = new Date(booking.updated_at || booking.start_time).getTime()
      return Number.isFinite(updatedAt) && updatedAt >= recentThreshold
    }).length

    return NextResponse.json({
      totals: {
        total: bookings.length,
        cancelled: byStatus.cancelled || 0,
        completed: byStatus.completed || 0,
        pending: byStatus.pending || 0,
        confirmed: byStatus.confirmed || 0,
        recently_modified: recentlyModified,
      },
      by_status: byStatus,
      by_source: bySource,
      by_service: byService,
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
