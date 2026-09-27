import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAccountingAccess } from '@/lib/accounting/access'
import { ACCOUNTING_PRIVATE_RESPONSE } from '@/lib/accounting/api'

export const dynamic = 'force-dynamic'

const querySchema = z
  .object({
    branch: z.string().trim().min(1).max(120),
    month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  })
  .strict()

type SourceSummary = {
  key: 'ticketing' | 'packages' | 'pos' | 'lms'
  label: string
  count: number | null
  income: number | null
  expenses: number | null
  net: number | null
  href: string
  available: boolean
  note: string
}

type FareRow = {
  quantity: number | null
  unit_sale_price_source: number | string | null
  unit_supplier_cost_source: number | string | null
}
type PackageReservationRow = {
  booked_cost_total: number | string | null
  sold_price_total: number | string | null
  discount_total: number | string | null
  supplier_refund_total: number | string | null
  customer_refund_total: number | string | null
  commission_expected_total: number | string | null
}

function firstDayAfter(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${monthNumber === 12 ? year + 1 : year}-${String(monthNumber === 12 ? 1 : monthNumber + 1).padStart(2, '0')}-01`
}

function numberValue(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function sourceError(key: SourceSummary['key'], label: string, href: string, note: string) {
  return { key, label, count: null, income: null, expenses: null, net: null, href, available: false, note }
}

export async function GET(request: Request) {
  const access = await requireAccountingAccess()
  if (!access.authorized) return access.response

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) {
    return apiError('Choose a valid branch and month.', 400, {}, ACCOUNTING_PRIVATE_RESPONSE)
  }

  const { branch, month } = parsed.data
  const startDate = `${month}-01`
  const endDate = firstDayAfter(month)
  const supabase = access.supabase

  const locationResult = await supabase
    .from('locations')
    .select('id, name, branch_code')
    .ilike('name', branch)
    .maybeSingle()
  if (locationResult.error) {
    return apiError('Unable to find the selected branch.', 500, {}, ACCOUNTING_PRIVATE_RESPONSE)
  }
  if (!locationResult.data) {
    return apiError('The selected branch was not found.', 404, {}, ACCOUNTING_PRIVATE_RESPONSE)
  }

  const locationId = locationResult.data.id
  const employeesResult = await supabase
    .from('employees')
    .select('id')
    .eq('location_id', locationId)
    .eq('is_active', true)
  if (employeesResult.error) {
    return apiError('Unable to resolve the selected branch team.', 500, {}, ACCOUNTING_PRIVATE_RESPONSE)
  }
  const employeeIds = (employeesResult.data || []).map((row) => row.id)

  const ticketingPromise = employeeIds.length
    ? supabase
        .from('ticket_transactions')
        .select(
          'id, service_type, ticket_bookings!inner(owner_employee_id), ticket_passenger_fare_lines(quantity, unit_sale_price_source, unit_supplier_cost_source)',
        )
        .in('ticket_bookings.owner_employee_id', employeeIds)
        .gte('booking_date', startDate)
        .lt('booking_date', endDate)
    : Promise.resolve({ data: [], error: null })
  const [ticketingResult, packagesResult, posResult] = await Promise.all([
    ticketingPromise,
    supabase
      .from('travel_packages')
      .select(
        'id, travel_package_reservations(booked_cost_total, sold_price_total, discount_total, supplier_refund_total, customer_refund_total, commission_expected_total)',
      )
      .eq('location_id', locationId)
      .gte('created_at', `${startDate}T00:00:00.000Z`)
      .lt('created_at', `${endDate}T00:00:00.000Z`),
    supabase
      .from('pos_transactions')
      .select('id, direction, total_amount')
      .eq('location_id', locationId)
      .gte('business_date', startDate)
      .lt('business_date', endDate),
  ])

  const ticketing: SourceSummary = ticketingResult.error
    ? sourceError('ticketing', 'Ticketing', '/dashboard/ticketing', 'Ticketing data is unavailable.')
    : (() => {
        let income = 0
        let expenses = 0
        for (const row of (ticketingResult.data || []) as Array<{ ticket_passenger_fare_lines: FareRow[] | null }>) {
          for (const fare of row.ticket_passenger_fare_lines || []) {
            const quantity = numberValue(fare.quantity)
            income += quantity * numberValue(fare.unit_sale_price_source)
            expenses += quantity * numberValue(fare.unit_supplier_cost_source)
          }
        }
        return {
          key: 'ticketing',
          label: 'Ticketing',
          count: (ticketingResult.data || []).length,
          income,
          expenses,
          net: income - expenses,
          href: '/dashboard/ticketing/ledger',
          available: true,
          note: 'Ticket sales less supplier cost, by ticket owner branch.',
        }
      })()

  const packages: SourceSummary = packagesResult.error
    ? sourceError('packages', 'Packages', '/dashboard/packages', 'Packages data is unavailable.')
    : {
        key: 'packages',
        label: 'Packages',
        count: (packagesResult.data || []).length,
        income: (() => {
          let total = 0
          for (const packageRow of (packagesResult.data || []) as Array<{
            travel_package_reservations: PackageReservationRow[] | null
          }>) {
            for (const reservation of packageRow.travel_package_reservations || []) {
              total +=
                numberValue(reservation.sold_price_total) -
                numberValue(reservation.discount_total) -
                numberValue(reservation.customer_refund_total)
            }
          }
          return total
        })(),
        expenses: (() => {
          let total = 0
          for (const packageRow of (packagesResult.data || []) as Array<{
            travel_package_reservations: PackageReservationRow[] | null
          }>) {
            for (const reservation of packageRow.travel_package_reservations || []) {
              total += numberValue(reservation.booked_cost_total) - numberValue(reservation.supplier_refund_total)
            }
          }
          return total
        })(),
        net: (() => {
          let total = 0
          for (const packageRow of (packagesResult.data || []) as Array<{
            travel_package_reservations: PackageReservationRow[] | null
          }>) {
            for (const reservation of packageRow.travel_package_reservations || []) {
              total +=
                numberValue(reservation.sold_price_total) -
                numberValue(reservation.discount_total) -
                numberValue(reservation.customer_refund_total) -
                numberValue(reservation.booked_cost_total) +
                numberValue(reservation.supplier_refund_total) +
                numberValue(reservation.commission_expected_total)
            }
          }
          return total
        })(),
        href: '/dashboard/packages',
        available: true,
        note: 'Package profit before agent commission, from reservation financials.',
      }

  const pos: SourceSummary = posResult.error
    ? sourceError('pos', 'POS', '/dashboard/pos', 'POS data is unavailable.')
    : (() => {
        let income = 0
        let expenses = 0
        for (const row of (posResult.data || []) as Array<{ direction: string; total_amount: number | string }>) {
          if (row.direction === 'OUT') expenses += numberValue(row.total_amount)
          else income += numberValue(row.total_amount)
        }
        return {
          key: 'pos',
          label: 'POS',
          count: (posResult.data || []).length,
          income,
          expenses,
          net: income - expenses,
          href: '/dashboard/pos',
          available: true,
          note: 'Branch till activity from the POS ledger.',
        }
      })()

  const lms = sourceError(
    'lms',
    'LMS',
    '/dashboard/lms',
    'LMS is company-wide and is shown in Company Ledger, not assigned to a branch.',
  )

  return apiOk(
    {
      branch: { id: locationResult.data.id, name: locationResult.data.name, branchCode: locationResult.data.branch_code },
      month,
      sources: [ticketing, packages, pos, lms],
      sourceOfTruth:
        'Operational modules remain the source of truth; the Branch Ledger represents their net result as read-only imported income or expense rows.',
    },
    ACCOUNTING_PRIVATE_RESPONSE,
  )
}
