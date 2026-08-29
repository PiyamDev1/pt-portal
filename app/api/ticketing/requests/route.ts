import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { ADMIN_ROLES } from '@/lib/auth/staffSession'
import { requireTicketingAccess } from '@/lib/ticketing/apiAuth'

type Related<T> = T | T[] | null
type RequestRow = {
  id: string
  booking_id: string
  request_type: 'amendment' | 'deletion'
  request_notes: string | null
  created_at: string
  requested_by_employee: Related<{ id: string; full_name: string | null }>
  ticket_bookings: Related<{
    id: string
    pnr: string
    customer_name: string
    archived_at: string | null
  }>
}

function first<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

function isAdmin(role: string) {
  const normalized = role.trim().toLowerCase().replace(/[_-]+/g, ' ')
  return ADMIN_ROLES.some(
    (candidate) => candidate.trim().toLowerCase().replace(/[_-]+/g, ' ') === normalized,
  )
}

export async function GET() {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  if (!isAdmin(access.employee.role)) return apiError('Forbidden', 403)

  const supabase = getServiceSupabaseClient()
  const { data, error } = await supabase
    .from('ticket_change_requests')
    .select(
      `
      id,
      booking_id,
      request_type,
      request_notes,
      created_at,
      requested_by_employee:employees!ticket_change_requests_requested_by_fkey(id, full_name),
      ticket_bookings!inner(id, pnr, customer_name, archived_at)
    `,
    )
    .eq('status', 'pending')
    .is('ticket_bookings.archived_at', null)
    .order('created_at', { ascending: true })
    .limit(100)
  if (error) return apiError('Unable to load ticket change requests.', 500)

  const items = ((data || []) as unknown as RequestRow[]).flatMap((row) => {
    const employee = first(row.requested_by_employee)
    const booking = first(row.ticket_bookings)
    if (!employee || !booking) return []
    return [
      {
        id: row.id,
        bookingId: booking.id,
        pnr: booking.pnr,
        customerName: booking.customer_name,
        requestType: row.request_type,
        requestNotes: row.request_notes,
        createdAt: row.created_at,
        requestedBy: { id: employee.id, fullName: employee.full_name?.trim() || 'Staff member' },
      },
    ]
  })
  return apiOk({ items }, { headers: { 'Cache-Control': 'private, no-store' } })
}
