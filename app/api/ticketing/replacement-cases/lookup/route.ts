import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { canManageTicketingRecords, requireTicketingAccess } from '@/lib/ticketing/apiAuth'

const PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

type Related<T> = T | T[] | null
type LookupRow = {
  id: string
  version: number | string
  pnr: string
  customer_name: string
  owner_employee_id: string
  owner: Related<{ id: string; full_name: string | null }>
  airline: Related<{ id: string; iata_code: string; name: string }>
  ticket_transactions: Array<{
    id: string
    passenger_ticket_count: number
    issued_at: string
    ticket_passenger_fare_lines: Array<{
      supplier_total_gbp: string | number
      sale_total_gbp: string | number
    }> | null
  }> | null
}

function first<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

export async function GET(request: NextRequest) {
  const access = await requireTicketingAccess()
  if (!access.authorized) return access.response
  const pnr = (request.nextUrl.searchParams.get('pnr') || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  if (pnr.length < 3 || pnr.length > 12) return apiError('Enter an exact PNR.', 400)
  const supabase = getServiceSupabaseClient()
  let query = supabase
    .from('ticket_bookings')
    .select(
      `
      id, version, pnr, customer_name, owner_employee_id,
      owner:employees!ticket_bookings_owner_employee_id_fkey(id, full_name),
      airline:airlines!ticket_bookings_airline_id_fkey(id, iata_code, name),
      ticket_transactions!inner(
        id, passenger_ticket_count, issued_at,
        ticket_passenger_fare_lines(supplier_total_gbp, sale_total_gbp)
      )
    `,
    )
    .eq('normalized_pnr', pnr)
    .is('archived_at', null)
    .eq('ticket_transactions.service_type', 'TK')
    .is('ticket_transactions.parent_transaction_id', null)
    .eq('ticket_transactions.operational_status', 'issued')
  if (!canManageTicketingRecords(access.employee.role)) {
    query = query.eq('owner_employee_id', access.employee.id)
  }
  const { data, error } = await query.limit(5)
  if (error) return apiError('Unable to look up that PNR right now.', 500)
  const items = ((data || []) as unknown as LookupRow[]).flatMap((row) => {
    const owner = first(row.owner)
    const airline = first(row.airline)
    const transaction = row.ticket_transactions?.[0]
    if (!owner?.full_name?.trim() || !airline || !transaction?.issued_at) return []
    const fares = transaction.ticket_passenger_fare_lines || []
    return [
      {
        bookingId: row.id,
        transactionId: transaction.id,
        bookingVersion: Number(row.version),
        pnr: row.pnr,
        customerName: row.customer_name,
        passengerCount: Number(transaction.passenger_ticket_count),
        supplierCostGbp: fares.reduce((total, fare) => total + Number(fare.supplier_total_gbp), 0),
        salePriceGbp: fares.reduce((total, fare) => total + Number(fare.sale_total_gbp), 0),
        owner: { id: owner.id, fullName: owner.full_name.trim() },
        airline: { id: airline.id, iataCode: airline.iata_code, name: airline.name },
        issuedAt: transaction.issued_at,
      },
    ]
  })
  return apiOk({ items }, PRIVATE_RESPONSE)
}
