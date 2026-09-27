import type { SupabaseClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireAccountingAccess } from '@/lib/accounting/access'
import { ACCOUNTING_PRIVATE_RESPONSE } from '@/lib/accounting/api'
import {
  buildAccountingTicketingReport,
  TICKETING_SERVICE_TYPES,
  type NormalizedTicketingTransaction,
  type TicketingReportBranch,
  type TicketingServiceType,
} from '@/lib/accounting/ticketingReports'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 1000
const MAX_PAGES = 100

type Related<T> = T | T[] | null

type RawTicketTransaction = {
  id: string
  booking_id: string
  service_type: TicketingServiceType
  operational_status: string
  payment_status: string
  booking_date: string
  passenger_ticket_count: number | string | null
  ticket_bookings: Related<{
    id: string
    location_id: string
    pnr: string | null
    customer_name: string | null
    archived_at: string | null
    airlines: Related<{ iata_code: string | null; name: string | null }>
  }>
  responsible_employee: Related<{ full_name: string | null }>
  ticket_passenger_fare_lines: Array<{
    sale_total_gbp: number | string | null
    supplier_total_gbp: number | string | null
  }> | null
}

function firstRelated<T>(value: Related<T>): T | null {
  return Array.isArray(value) ? value[0] || null : value
}

function cleanLabel(value: string | null | undefined, fallback: string) {
  return String(value || '').trim() || fallback
}

function amount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeTransaction(row: RawTicketTransaction): NormalizedTicketingTransaction | null {
  const booking = firstRelated(row.ticket_bookings)
  if (!booking || booking.archived_at) return null
  const airline = firstRelated(booking.airlines)
  const employee = firstRelated(row.responsible_employee)
  const fares = row.ticket_passenger_fare_lines || []

  return {
    id: row.id,
    bookingId: row.booking_id,
    branchId: booking.location_id,
    pnr: cleanLabel(booking.pnr, 'No PNR'),
    customerName: cleanLabel(booking.customer_name, 'Customer not recorded'),
    airlineCode: cleanLabel(airline?.iata_code, 'N/A').toUpperCase(),
    airlineName: cleanLabel(airline?.name, 'Airline not recorded'),
    ownerName: cleanLabel(employee?.full_name, 'Staff member not recorded'),
    bookingDate: row.booking_date,
    serviceType: row.service_type,
    operationalStatus: cleanLabel(row.operational_status, 'Unknown'),
    paymentStatus: cleanLabel(row.payment_status, 'Unknown'),
    passengerCount: amount(row.passenger_ticket_count),
    saleGbp: fares.reduce((total, fare) => total + amount(fare.sale_total_gbp), 0),
    supplierCostGbp: fares.reduce((total, fare) => total + amount(fare.supplier_total_gbp), 0),
  }
}

function parseYear(value: string | null, currentYear: number) {
  if (!value) return currentYear
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) return null
  return year
}

async function fetchTransactions(
  supabase: SupabaseClient,
  fromDate: string,
  toDate: string,
  branchId: string | 'all',
  service: TicketingServiceType | 'all',
) {
  const rows: RawTicketTransaction[] = []

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = supabase
      .from('ticket_transactions')
      .select(
        `
          id,
          booking_id,
          service_type,
          operational_status,
          payment_status,
          booking_date,
          passenger_ticket_count,
          ticket_bookings!inner(
            id,
            location_id,
            pnr,
            customer_name,
            archived_at,
            airlines(iata_code, name)
          ),
          responsible_employee:employees!ticket_transactions_owner_employee_id_fkey(full_name),
          ticket_passenger_fare_lines(sale_total_gbp, supplier_total_gbp)
        `,
      )
      .is('ticket_bookings.archived_at', null)
      .gte('booking_date', fromDate)
      .lt('booking_date', toDate)
      .order('booking_date', { ascending: true })

    if (branchId !== 'all') query = query.eq('ticket_bookings.location_id', branchId)
    if (service !== 'all') query = query.eq('service_type', service)

    const { data, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw error

    const pageRows = (data || []) as unknown as RawTicketTransaction[]
    rows.push(...pageRows)
    if (pageRows.length < PAGE_SIZE) {
      return rows.flatMap((row) => {
        const normalized = normalizeTransaction(row)
        return normalized ? [normalized] : []
      })
    }
  }

  throw new Error(`Ticketing report exceeds ${PAGE_SIZE * MAX_PAGES} transactions`)
}

export async function GET(request: Request) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response

  try {
    const supabase = getServiceSupabaseClient()
    const { searchParams } = new URL(request.url)
    const currentYear = new Date().getUTCFullYear()
    const year = parseYear(searchParams.get('year'), currentYear)
    if (!year) {
      return apiError(
        `year must be between 2000 and ${currentYear + 1}`,
        400,
        {},
        ACCOUNTING_PRIVATE_RESPONSE,
      )
    }

    const serviceParam = searchParams.get('service') || 'all'
    if (
      serviceParam !== 'all' &&
      !TICKETING_SERVICE_TYPES.includes(serviceParam as TicketingServiceType)
    ) {
      return apiError('service must be all, TK, DC, or R-ER', 400, {}, ACCOUNTING_PRIVATE_RESPONSE)
    }
    const service = serviceParam as TicketingServiceType | 'all'

    const branchesResult = await supabase
      .from('locations')
      .select('id, name, branch_code')
      .order('name', { ascending: true })
      .limit(500)
    if (branchesResult.error) throw branchesResult.error

    const branches = (
      (branchesResult.data || []) as Array<{
        id: string
        name: string
        branch_code: string | null
      }>
    ).map<TicketingReportBranch>((branch) => ({
      id: branch.id,
      name: branch.name,
      branchCode: branch.branch_code,
    }))

    const branchParam = searchParams.get('branchId') || 'all'
    if (branchParam !== 'all' && !branches.some((branch) => branch.id === branchParam)) {
      return apiError('The selected branch no longer exists.', 404, {}, ACCOUNTING_PRIVATE_RESPONSE)
    }
    const branchId = branchParam as string | 'all'
    const transactions = await fetchTransactions(
      supabase,
      `${year}-01-01`,
      `${year + 1}-01-01`,
      branchId,
      service,
    )

    return apiOk(
      buildAccountingTicketingReport({ transactions, branches, year, branchId, service }),
      ACCOUNTING_PRIVATE_RESPONSE,
    )
  } catch (error) {
    return apiError(
      toErrorMessage(error, 'Ticketing accounting report failed'),
      500,
      {},
      ACCOUNTING_PRIVATE_RESPONSE,
    )
  }
}
