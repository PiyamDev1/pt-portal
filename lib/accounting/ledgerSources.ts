import type { SupabaseClient } from '@supabase/supabase-js'
import type { LedgerItem } from '@/lib/accounting/ledger'
import {
  ACCOUNTING_SOURCE_REFERENCE_LIMIT,
  type AccountingSourceKey,
  type AccountingSourceReference,
  type AccountingSourceSummary,
} from '@/lib/accounting/sourceFacts'

type SupabaseLike = SupabaseClient

type FareRow = {
  sale_total_gbp: number | string | null
  supplier_total_gbp: number | string | null
}

type TicketRow = {
  id: string
  ticket_bookings:
    | { id: string; location_id: string; commission_scope: string; pnr: string | null }
    | Array<{ id: string; location_id: string; commission_scope: string; pnr: string | null }>
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
  id: string
  title: string
  travel_packages:
    | { id: string; location_id: string; package_reference: string | null }
    | Array<{ id: string; location_id: string; package_reference: string | null }>
    | null
}

type PosRow = {
  id: string
  reference_number: string
  location_id: string
  direction: string
  total_amount: number | string | null
}

const SOURCE_CONFIG: Record<
  AccountingSourceKey,
  Pick<
    AccountingSourceSummary,
    | 'label'
    | 'metricType'
    | 'metricLabel'
    | 'dateBasis'
    | 'dateBasisLabel'
    | 'includedInBranchResult'
    | 'inclusionNote'
    | 'sourcePath'
  >
> = {
  ticketing: {
    label: 'Ticketing',
    metricType: 'commercial_margin',
    metricLabel: 'Standalone gross margin',
    dateBasis: 'booking_date',
    dateBasisLabel: 'Ticket booking date',
    includedInBranchResult: true,
    inclusionNote:
      'Includes ticket-owned bookings only. Package-owned and unresolved bookings are excluded to prevent duplicate package profit.',
    sourcePath: '/dashboard/accounting/ticketing',
  },
  packages: {
    label: 'Packages',
    metricType: 'projected_margin',
    metricLabel: 'Projected package margin',
    dateBasis: 'reservation_created_at',
    dateBasisLabel: 'Reservation creation date',
    includedInBranchResult: true,
    inclusionNote:
      'Projected result uses reservation sale, booked cost, discounts, refunds and expected commission.',
    sourcePath: '/dashboard/packages',
  },
  pos: {
    label: 'POS',
    metricType: 'cash_movement',
    metricLabel: 'Cash movement',
    dateBasis: 'business_date',
    dateBasisLabel: 'POS business date',
    includedInBranchResult: false,
    inclusionNote:
      'Shown for reconciliation only. POS money movement is not added to branch profit because it may settle Ticketing, Package, Application or LMS activity.',
    sourcePath: '/dashboard/pos',
  },
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

function emptySource(key: AccountingSourceKey): AccountingSourceSummary {
  return {
    snapshotVersion: 1,
    key,
    ...SOURCE_CONFIG[key],
    count: 0,
    excludedCount: 0,
    income: 0,
    expenses: 0,
    net: 0,
    references: [],
    referencesTruncated: false,
    available: true,
  }
}

function failedSource(key: AccountingSourceKey): AccountingSourceSummary {
  return {
    ...emptySource(key),
    available: false,
    warning: `${SOURCE_CONFIG[key].label} results could not be loaded.`,
  }
}

function relatedTicketLocation(row: TicketRow) {
  const related = row.ticket_bookings
  return Array.isArray(related) ? related[0]?.location_id : related?.location_id
}

function relatedTicketBooking(row: TicketRow) {
  return Array.isArray(row.ticket_bookings) ? row.ticket_bookings[0] : row.ticket_bookings
}

function addReference(source: AccountingSourceSummary, reference: AccountingSourceReference) {
  if (source.references.some((item) => item.id === reference.id)) return
  if (source.references.length >= ACCOUNTING_SOURCE_REFERENCE_LIMIT) {
    source.referencesTruncated = true
    return
  }
  source.references.push(reference)
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
  const results = new Map<string, AccountingSourceSummary[]>()
  for (const locationId of locationIds) {
    results.set(locationId, [emptySource('ticketing'), emptySource('packages'), emptySource('pos')])
  }
  if (locationIds.length === 0) return results

  const startDate = `${month}-01`
  const endDate = monthEnd(month)
  const [ticketingResult, packagesResult, posResult] = await Promise.all([
    supabase
      .from('ticket_transactions')
      .select(
        'id, ticket_bookings!inner(id, location_id, archived_at, commission_scope, pnr), ticket_passenger_fare_lines(sale_total_gbp, supplier_total_gbp)',
      )
      .in('ticket_bookings.location_id', locationIds)
      .is('ticket_bookings.archived_at', null)
      .gte('booking_date', startDate)
      .lt('booking_date', endDate),
    supabase
      .from('travel_package_reservations')
      .select(
        'id, title, booked_cost_total, sold_price_total, discount_total, supplier_refund_total, customer_refund_total, commission_expected_total, travel_packages!inner(id, location_id, package_reference)',
      )
      .in('travel_packages.location_id', locationIds)
      .gte('created_at', `${startDate}T00:00:00.000Z`)
      .lt('created_at', `${endDate}T00:00:00.000Z`),
    supabase
      .from('pos_transactions')
      .select('id, reference_number, location_id, direction, total_amount')
      .in('location_id', locationIds)
      .gte('business_date', startDate)
      .lt('business_date', endDate),
  ])

  for (const [locationId, sources] of results) {
    if (ticketingResult.error) sources[0] = failedSource('ticketing')
    if (packagesResult.error) sources[1] = failedSource('packages')
    if (posResult.error) sources[2] = failedSource('pos')
    results.set(locationId, sources)
  }

  if (!ticketingResult.error) {
    for (const row of (ticketingResult.data || []) as TicketRow[]) {
      const booking = relatedTicketBooking(row)
      const locationId = relatedTicketLocation(row)
      const source = locationId ? results.get(locationId)?.[0] : null
      if (!source || !booking) continue
      if (booking.commission_scope !== 'ticket') {
        source.excludedCount += 1
        continue
      }
      source.count += 1
      addReference(source, {
        id: booking.id,
        label: booking.pnr?.trim() || `Ticket ${source.count}`,
        path: `/dashboard/ticketing/ledger?search=${encodeURIComponent(booking.pnr?.trim() || booking.id)}`,
      })
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
      if (!source || !packageRow) continue
      const amounts = packageReservationLedgerAmounts(row)
      source.count += 1
      addReference(source, {
        id: row.id,
        label:
          packageRow.package_reference?.trim() || row.title?.trim() || `Package ${source.count}`,
        path: `/dashboard/packages/${packageRow.id}`,
      })
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
      addReference(source, {
        id: row.id,
        label: row.reference_number,
        path: `/dashboard/pos?search=${encodeURIComponent(row.reference_number)}`,
      })
      if (row.direction === 'OUT') source.expenses += amount(row.total_amount)
      else source.income += amount(row.total_amount)
      source.net = source.income - source.expenses
    }
  }

  for (const sources of results.values()) {
    for (const source of sources) {
      source.income = roundMoney(source.income)
      source.expenses = roundMoney(source.expenses)
      source.net = roundMoney(source.income - source.expenses)
    }
  }

  return results
}

export function moduleResultsToLedgerItems(month: string, sources: AccountingSourceSummary[]) {
  return sources.flatMap<LedgerItem>((source) => {
    if (!source.available || !source.includedInBranchResult || Math.abs(source.net) < 0.005) {
      return []
    }
    const positive = source.net > 0
    const label = `${source.metricLabel} ${positive ? '' : 'loss'}`.trim()
    return [
      {
        id: `source-${month}-${source.key}`,
        label,
        group: positive ? 'Module profit' : 'Module losses / costs',
        amount: Math.abs(source.net),
        kind: positive ? 'income' : 'expense',
        sourceKey: source.key,
        sourceRecordCount: source.count,
        excludedRecordCount: source.excludedCount,
        sourcePath: source.sourcePath,
        metricType: source.metricType,
        metricLabel: source.metricLabel,
        dateBasis: source.dateBasis,
        dateBasisLabel: source.dateBasisLabel,
        inclusionNote: source.inclusionNote,
        snapshotVersion: 1,
      },
    ]
  })
}

export function legacyLedgerItemsToSourceSummaries(items: LedgerItem[]) {
  return items.flatMap<AccountingSourceSummary>((item) => {
    if (!item.sourceKey) return []
    const summary = emptySource(item.sourceKey)
    summary.count = item.sourceRecordCount || 0
    summary.excludedCount = item.excludedRecordCount || 0
    summary.income = item.kind === 'income' ? item.amount : 0
    summary.expenses = item.kind === 'expense' ? item.amount : 0
    summary.net = item.kind === 'income' ? item.amount : -item.amount
    summary.metricType = item.metricType || summary.metricType
    summary.metricLabel = item.metricLabel || summary.metricLabel
    summary.dateBasis = item.dateBasis || summary.dateBasis
    summary.dateBasisLabel = item.dateBasisLabel || summary.dateBasisLabel
    summary.inclusionNote = item.inclusionNote || summary.inclusionNote
    summary.sourcePath = item.sourcePath || summary.sourcePath
    return [summary]
  })
}

export function moduleResultWarnings(sources: AccountingSourceSummary[]) {
  return sources.flatMap((source) => (source.warning ? [source.warning] : []))
}
