import 'server-only'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import type {
  PosLedgerPayload,
  PosLedgerPaymentMethod,
  PosLedgerPeriod,
  PosLedgerSummary,
  PosLedgerTender,
  PosLedgerTransaction,
} from '@/lib/pos/contracts'

const POS_LEDGER_LIMIT = 500

type Related<T> = T | T[] | null

type EmployeeLocationRow = {
  location_id: string | null
  locations: Related<{ id: string; name: string; timezone: string }>
}

type BranchEmployeeRow = {
  id: string
  full_name: string | null
}

type LedgerRow = {
  id: string
  work_date: string
  created_at: string
  customer_full_name: string | null
  remark: string | null
  source_link_id: string | null
  total_amount: number | string
  employee_id: string
  accounting_category: Related<{ name: string; type: 'INCOME' | 'EXPENSE' }>
  supplier: Related<{ name: string }>
  daily_payment_splits: Array<{
    amount: number | string
    transaction_type: 'INCOME' | 'EXPENSE'
    reconciliation_status: 'CLEARED' | 'OWED_TO_US' | 'UNPAID_DEBT_IN'
    transaction_method: Related<{ name: string }>
  }> | null
}

export class PosLedgerAccessError extends Error {}

function firstRelated<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export function posLedgerPeriodBounds(date: string, period: PosLedgerPeriod) {
  if (!isIsoDate(date)) throw new Error('Invalid POS ledger date')
  if (period === 'day') return { startDate: date, endDate: date }

  const startDate = `${date.slice(0, 7)}-01`
  const nextMonth = new Date(`${startDate}T00:00:00Z`)
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  nextMonth.setUTCDate(0)
  return { startDate, endDate: nextMonth.toISOString().slice(0, 10) }
}

function normalizedPaymentMethod(
  name: string | null | undefined,
): Exclude<PosLedgerPaymentMethod, 'Split'> {
  const normalized = String(name || '')
    .trim()
    .toLowerCase()
  if (normalized.includes('cash')) return 'Cash'
  if (normalized.includes('card')) return 'Card'
  if (normalized.includes('bank') || normalized.includes('transfer')) return 'Bank'
  return 'Other'
}

function formatTime(createdAt: string, timezone: string) {
  const date = new Date(createdAt)
  if (Number.isNaN(date.valueOf())) return '--:--'
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(date)
}

function ledgerReference(row: LedgerRow) {
  return `POS-${row.work_date.replace(/-/g, '')}-${row.id.slice(0, 8).toUpperCase()}`
}

function ledgerTransaction(
  row: LedgerRow,
  employeeNames: Map<string, string>,
  timezone: string,
): PosLedgerTransaction {
  const category = firstRelated(row.accounting_category)
  const supplier = firstRelated(row.supplier)
  const tenders: PosLedgerTender[] = (row.daily_payment_splits || []).map((split) => ({
    method: normalizedPaymentMethod(firstRelated(split.transaction_method)?.name),
    amount: Math.abs(Number(split.amount) || 0),
    direction: split.transaction_type === 'EXPENSE' ? 'OUT' : 'IN',
    reconciliationStatus: split.reconciliation_status,
  }))
  const methods = [...new Set(tenders.map((tender) => tender.method))]
  const method: PosLedgerPaymentMethod =
    methods.length > 1 ? 'Split' : methods[0] || ('Other' as const)
  const isExpense =
    category?.type === 'EXPENSE' ||
    (tenders.length > 0 && tenders.every((tender) => tender.direction === 'OUT'))
  const amount = Math.abs(Number(row.total_amount) || 0) * (isExpense ? -1 : 1)
  const hasPendingTender = tenders.some((tender) => tender.reconciliationStatus !== 'CLEARED')

  return {
    id: row.id,
    reference: ledgerReference(row),
    date: row.work_date,
    time: formatTime(row.created_at, timezone),
    name: row.customer_full_name?.trim() || supplier?.name || 'Walk-in',
    category: category?.name || 'Uncategorised',
    method,
    amount,
    points: 0,
    status: hasPendingTender ? 'Pending' : supplier && isExpense ? 'Supplier payment' : 'Posted',
    note: row.remark?.trim() || '',
    supplier: supplier?.name,
    entryAgent: employeeNames.get(row.employee_id) || 'Staff member',
    sourceLinkId: row.source_link_id,
    tenders,
  }
}

function summarize(items: PosLedgerTransaction[]): PosLedgerSummary {
  const summary: PosLedgerSummary = {
    moneyIn: 0,
    moneyOut: 0,
    netMovement: 0,
    cashNet: 0,
    cardNet: 0,
    bankNet: 0,
    unreconciledCount: 0,
  }

  for (const item of items) {
    summary.moneyIn += Math.max(item.amount, 0)
    summary.moneyOut += Math.abs(Math.min(item.amount, 0))
    summary.netMovement += item.amount

    for (const tender of item.tenders) {
      const signedAmount = tender.direction === 'OUT' ? -tender.amount : tender.amount
      if (tender.method === 'Cash') summary.cashNet += signedAmount
      if (tender.method === 'Card') summary.cardNet += signedAmount
      if (tender.method === 'Bank') summary.bankNet += signedAmount
      if (tender.reconciliationStatus !== 'CLEARED') summary.unreconciledCount += 1
    }
  }

  return summary
}

export async function loadPosLedger(
  employeeId: string,
  period: PosLedgerPeriod,
  date: string,
): Promise<PosLedgerPayload> {
  const { startDate, endDate } = posLedgerPeriodBounds(date, period)
  const supabase = getServiceSupabaseClient()
  const { data: employee, error: employeeError } = await supabase
    .from('employees')
    .select('location_id, locations(id, name, timezone)')
    .eq('id', employeeId)
    .maybeSingle()

  if (employeeError) throw employeeError
  const employeeLocation = employee as unknown as EmployeeLocationRow | null
  const location = firstRelated(employeeLocation?.locations || null)
  if (!employeeLocation?.location_id || !location) {
    throw new PosLedgerAccessError('Your employee profile is not assigned to a branch.')
  }

  const { data: branchEmployees, error: branchEmployeesError } = await supabase
    .from('employees')
    .select('id, full_name')
    .eq('location_id', employeeLocation.location_id)

  if (branchEmployeesError) throw branchEmployeesError
  const employeeRows = (branchEmployees || []) as BranchEmployeeRow[]
  const employeeIds = employeeRows.map((row) => row.id)
  const employeeNames = new Map(
    employeeRows.map((row) => [row.id, row.full_name?.trim() || 'Staff member']),
  )

  if (employeeIds.length === 0) {
    return {
      items: [],
      summary: summarize([]),
      context: {
        branchId: location.id,
        branchName: location.name,
        timezone: location.timezone || 'Europe/London',
        period,
        date,
        loadedAt: new Date().toISOString(),
        source: 'daily_ledger_entries',
        truncated: false,
      },
    }
  }

  const { data, error } = await supabase
    .from('daily_ledger_entries')
    .select(
      `
        id,
        work_date,
        created_at,
        customer_full_name,
        remark,
        source_link_id,
        total_amount,
        employee_id,
        accounting_category:accounting_categories(name, type),
        supplier:supplier_vendors(name),
        daily_payment_splits(
          amount,
          transaction_type,
          reconciliation_status,
          transaction_method:transaction_methods(name)
        )
      `,
    )
    .in('employee_id', employeeIds)
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(POS_LEDGER_LIMIT + 1)

  if (error) throw error
  const rows = (data || []) as unknown as LedgerRow[]
  const timezone = location.timezone || 'Europe/London'
  const items = rows
    .slice(0, POS_LEDGER_LIMIT)
    .map((row) => ledgerTransaction(row, employeeNames, timezone))

  return {
    items,
    summary: summarize(items),
    context: {
      branchId: location.id,
      branchName: location.name,
      timezone,
      period,
      date,
      loadedAt: new Date().toISOString(),
      source: 'daily_ledger_entries',
      truncated: rows.length > POS_LEDGER_LIMIT,
    },
  }
}
