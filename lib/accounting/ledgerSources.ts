import type { SupabaseClient } from '@supabase/supabase-js'
import type { LedgerItem } from '@/lib/accounting/ledger'

type SupabaseLike = SupabaseClient

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
  sale_total_gbp: number | string | null
  supplier_total_gbp: number | string | null
}

type TicketRow = {
  ticket_bookings: { location_id: string } | Array<{ location_id: string }> | null
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

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
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

function relatedTicketLocation(row: TicketRow) {
  const related = row.ticket_bookings
  return Array.isArray(related) ? related[0]?.location_id : related?.location_id
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
  const [ticketingResult, packagesResult, posResult] = await Promise.all([
    supabase
      .from('ticket_transactions')
      .select(
        'id, ticket_bookings!inner(location_id, archived_at), ticket_passenger_fare_lines(sale_total_gbp, supplier_total_gbp)',
      )
      .in('ticket_bookings.location_id', locationIds)
      .is('ticket_bookings.archived_at', null)
      .gte('booking_date', startDate)
      .lt('booking_date', endDate),
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
    if (ticketingResult.error) sources[0] = failedSource('ticketing', 'Ticketing')
    if (packagesResult.error) sources[1] = failedSource('packages', 'Packages')
    if (posResult.error) sources[2] = failedSource('pos', 'POS')
    results.set(locationId, sources)
  }

  if (!ticketingResult.error) {
    for (const row of (ticketingResult.data || []) as TicketRow[]) {
      const locationId = relatedTicketLocation(row)
      const source = locationId ? results.get(locationId)?.[0] : null
      if (!source) continue
      source.count += 1
      for (const fare of row.ticket_passenger_fare_lines || []) {
        source.income += amount(fare.sale_total_gbp)
        source.expenses += amount(fare.supplier_total_gbp)
      }
      source.income = roundMoney(source.income)
      source.expenses = roundMoney(source.expenses)
      source.net = roundMoney(source.income - source.expenses)
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
    const label =
      source.key === 'ticketing'
        ? `Ticketing gross ${positive ? 'margin' : 'loss'}`
        : `${source.label} ${positive ? 'profit' : 'loss'}`
    return [
      {
        id: `source-${month}-${source.key}`,
        label,
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
