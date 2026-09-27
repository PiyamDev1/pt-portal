import type { LedgerItem } from '@/lib/accounting/ledger'
import type { AccountingAccessResult } from '@/lib/accounting/access'

type SupabaseLike = Extract<AccountingAccessResult, { authorized: true }>['supabase']

type SourceKey = NonNullable<LedgerItem['sourceKey']>

type SourceResult = {
  key: SourceKey
  label: string
  count: number
  income: number
  expenses: number
  net: number
  available: boolean
  warning?: string
}

type FareRow = {
  quantity: number | string | null
  unit_sale_price_source: number | string | null
  unit_supplier_cost_source: number | string | null
}

type TicketRow = {
  ticket_bookings:
    | { owner_employee_id: string | null }
    | Array<{ owner_employee_id: string | null }>
    | null
  ticket_passenger_fare_lines: FareRow[] | null
}

type PackageReservationRow = {
  booked_cost_total: number | string | null
  sold_price_total: number | string | null
  discount_total: number | string | null
  supplier_refund_total: number | string | null
  customer_refund_total: number | string | null
  commission_expected_total: number | string | null
}

type PackageRow = PackageReservationRow & {
  travel_packages: { location_id: string } | Array<{ location_id: string }> | null
}

type PosRow = {
  location_id: string
  direction: string
  total_amount: number | string | null
}

function amount(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, monthNumber, 1))
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function emptySource(key: SourceKey, label: string): SourceResult {
  return { key, label, count: 0, income: 0, expenses: 0, net: 0, available: true }
}

function failedSource(key: SourceKey, label: string): SourceResult {
  return {
    ...emptySource(key, label),
    available: false,
    warning: `${label} results could not be loaded.`,
  }
}

function relatedOwner(row: TicketRow) {
  const related = row.ticket_bookings
  return Array.isArray(related) ? related[0]?.owner_employee_id : related?.owner_employee_id
}

export function packageReservationLedgerAmounts(reservation: PackageReservationRow) {
  const income =
    amount(reservation.sold_price_total) -
    amount(reservation.discount_total) -
    amount(reservation.customer_refund_total)
  const expenses =
    amount(reservation.booked_cost_total) -
    amount(reservation.supplier_refund_total) +
    amount(reservation.commission_expected_total)
  return { income, expenses, net: income - expenses }
}

export async function loadBranchModuleResults(
  supabase: SupabaseLike,
  locationIds: string[],
  month: string,
) {
  const results = new Map<string, SourceResult[]>()
  for (const locationId of locationIds) {
    results.set(locationId, [
      emptySource('ticketing', 'Ticketing'),
      emptySource('packages', 'Packages'),
      emptySource('pos', 'POS'),
    ])
  }
  if (locationIds.length === 0) return results

  const startDate = `${month}-01`
  const endDate = monthEnd(month)
  const employeesResult = await supabase
    .from('employees')
    .select('id, location_id')
    .in('location_id', locationIds)
    .eq('is_active', true)

  const employees = (employeesResult.data || []) as Array<{
    id: string
    location_id: string | null
  }>
  const locationByEmployee = new Map(
    employees
      .filter((employee) => employee.location_id)
      .map((employee) => [employee.id, employee.location_id as string]),
  )
  const employeeIds = [...locationByEmployee.keys()]

  const [ticketingResult, packagesResult, posResult] = await Promise.all([
    employeeIds.length
      ? supabase
          .from('ticket_transactions')
          .select(
            'id, ticket_bookings!inner(owner_employee_id, archived_at), ticket_passenger_fare_lines(quantity, unit_sale_price_source, unit_supplier_cost_source)',
          )
          .in('ticket_bookings.owner_employee_id', employeeIds)
          .is('ticket_bookings.archived_at', null)
          .gte('booking_date', startDate)
          .lt('booking_date', endDate)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('travel_package_reservations')
      .select(
        'id, booked_cost_total, sold_price_total, discount_total, supplier_refund_total, customer_refund_total, commission_expected_total, travel_packages!inner(location_id)',
      )
      .in('travel_packages.location_id', locationIds)
      .gte('created_at', `${startDate}T00:00:00.000Z`)
      .lt('created_at', `${endDate}T00:00:00.000Z`),
    supabase
      .from('pos_transactions')
      .select('id, location_id, direction, total_amount')
      .in('location_id', locationIds)
      .gte('business_date', startDate)
      .lt('business_date', endDate),
  ])

  for (const [locationId, sources] of results) {
    if (employeesResult.error || ticketingResult.error)
      sources[0] = failedSource('ticketing', 'Ticketing')
    if (packagesResult.error) sources[1] = failedSource('packages', 'Packages')
    if (posResult.error) sources[2] = failedSource('pos', 'POS')
    results.set(locationId, sources)
  }

  if (!employeesResult.error && !ticketingResult.error) {
    for (const row of (ticketingResult.data || []) as TicketRow[]) {
      const ownerId = relatedOwner(row)
      const locationId = ownerId ? locationByEmployee.get(ownerId) : null
      const source = locationId ? results.get(locationId)?.[0] : null
      if (!source) continue
      source.count += 1
      for (const fare of row.ticket_passenger_fare_lines || []) {
        const quantity = amount(fare.quantity)
        source.income += quantity * amount(fare.unit_sale_price_source)
        source.expenses += quantity * amount(fare.unit_supplier_cost_source)
      }
      source.net = source.income - source.expenses
    }
  }

  if (!packagesResult.error) {
    for (const row of (packagesResult.data || []) as PackageRow[]) {
      const packageRow = Array.isArray(row.travel_packages)
        ? row.travel_packages[0]
        : row.travel_packages
      const source = packageRow ? results.get(packageRow.location_id)?.[1] : null
      if (!source) continue
      const amounts = packageReservationLedgerAmounts(row)
      source.count += 1
      source.income += amounts.income
      source.expenses += amounts.expenses
      source.net = source.income - source.expenses
    }
  }

  if (!posResult.error) {
    for (const row of (posResult.data || []) as PosRow[]) {
      const source = results.get(row.location_id)?.[2]
      if (!source) continue
      source.count += 1
      if (row.direction === 'OUT') source.expenses += amount(row.total_amount)
      else source.income += amount(row.total_amount)
      source.net = source.income - source.expenses
    }
  }

  return results
}

export function moduleResultsToLedgerItems(month: string, sources: SourceResult[]) {
  return sources.flatMap<LedgerItem>((source) => {
    if (!source.available || Math.abs(source.net) < 0.005) return []
    const positive = source.net > 0
    return [
      {
        id: `source-${month}-${source.key}`,
        label: `${source.label} ${positive ? 'profit' : 'loss'}`,
        group: positive ? 'Module profit' : 'Module losses / costs',
        amount: Math.abs(source.net),
        kind: positive ? 'income' : 'expense',
        sourceKey: source.key,
      },
    ]
  })
}

export function moduleResultWarnings(sources: SourceResult[]) {
  return sources.flatMap((source) => (source.warning ? [source.warning] : []))
}
