import { NextRequest, NextResponse } from 'next/server'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { BookingStatus } from '@/app/types/bookings'

function escapeCsv(value: unknown): string {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const locationId = searchParams.get('location_id')
    const status = searchParams.get('status')
    const source = searchParams.get('source')

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to query params are required' }, { status: 400 })
    }

    const supabase = await getRouteSupabaseClient()
    let query = supabase
      .from('bookings')
      .select('*, booking_services:service_id(name)')
      .gte('start_time', from)
      .lt('start_time', to)
      .order('start_time', { ascending: true })

    if (locationId) query = query.eq('location_id', locationId)
    if (status && status !== 'all') query = query.eq('status', status)
    if (source && source !== 'all') query = query.eq('source', source)

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = [
      [
        'Customer Name',
        'Customer Phone',
        'Customer Email',
        'Service',
        'Status',
        'Source',
        'Person Count',
        'Tags',
        'Start Time',
        'End Time',
        'Last Email Status',
        'Last Email Subject',
        'Notes',
      ].join(','),
      ...(data || []).map((booking) => [
        escapeCsv(booking.customer_name),
        escapeCsv(booking.customer_phone),
        escapeCsv(booking.customer_email),
        escapeCsv((booking.booking_services as { name?: string } | null)?.name || ''),
        escapeCsv(booking.status),
        escapeCsv(booking.source),
        escapeCsv(booking.person_count ?? 1),
        escapeCsv(Array.isArray(booking.tags) ? booking.tags.join(' ') : ''),
        escapeCsv(booking.start_time),
        escapeCsv(booking.end_time),
        escapeCsv(booking.last_email_status ?? ''),
        escapeCsv(booking.last_email_subject ?? ''),
        escapeCsv(booking.notes ?? ''),
      ].join(',')),
    ].join('\n')

    return new NextResponse(rows, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bookings-${from.slice(0, 10)}-${to.slice(0, 10)}.csv"`,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
