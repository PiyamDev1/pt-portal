import type {
  AccountingDateBasis,
  AccountingMetricType,
  AccountingSourceKey,
  AccountingSourceSummary,
} from '@/lib/accounting/sourceFacts'

export type LedgerKind = 'income' | 'expense'
export type LedgerScope = 'branch' | 'company'
export type LedgerStatus = 'open' | 'finalised'

export type LedgerItem = {
  id: string
  label: string
  group: string
  amount: number
  kind: LedgerKind
  carriedFrom?: string
  sourceKey?: AccountingSourceKey
  sourceRecordCount?: number
  excludedRecordCount?: number
  sourcePath?: string
  metricType?: AccountingMetricType
  metricLabel?: string
  dateBasis?: AccountingDateBasis
  dateBasisLabel?: string
  inclusionNote?: string
  snapshotVersion?: 1
}

export type NamedBalance = {
  id: string
  name: string
  start: number
  end: number
  carriedFrom?: string
}

export type BranchLedgerPayload = {
  formatVersion: 1
  incomeGroups: string[]
  expenseGroups: string[]
  items: LedgerItem[]
  /** @deprecated Cash reconciliation belongs in POS, not the final account overview. */
  cashStart: number
  /** @deprecated Cash reconciliation belongs in POS, not the final account overview. */
  cashEnd: number
  profitStart: number
  profitEnd: number
  sourceSnapshot: LedgerItem[]
  sourceSummarySnapshot: AccountingSourceSummary[]
}

export type CompanyLedgerPayload = {
  formatVersion: 1
  lmsStart: number
  lmsEnd: number
  suppliers: NamedBalance[]
  banks: NamedBalance[]
}

export type LedgerBranch = {
  id: string
  name: string
  branchCode: string | null
}

export type LedgerSheet<T> = {
  id: string | null
  revision: number
  status: LedgerStatus
  payload: T
  updatedAt: string | null
  carriedFrom: string | null
}

export type BranchLedgerSummary = {
  branch: LedgerBranch
  income: number
  expenses: number
  net: number
  profitStart: number
  profitEnd: number
  status: LedgerStatus
}

export type CompanyLmsLiveSummary = {
  available: boolean
  totalOutstanding: number
  activeAccounts: number
  overdueAccounts: number
  dueSoonAccounts: number
  totalAccounts: number
  loadedAt: string
  sourcePath: string
  warning?: string
}

export type AccountingLedgerResponse = {
  month: string
  branches: LedgerBranch[]
  selectedBranch: LedgerBranch
  branchSheet: LedgerSheet<BranchLedgerPayload>
  companySheet: LedgerSheet<CompanyLedgerPayload>
  sourceItems: LedgerItem[]
  sourceSummaries: AccountingSourceSummary[]
  sourceWarnings: string[]
  branchSummaries: BranchLedgerSummary[]
  companyLmsSummary: CompanyLmsLiveSummary
}

export const DEFAULT_INCOME_GROUPS = [
  'Commissions & transfers',
  'Document & travel services',
  'Other income',
  'Module profit',
]

export const DEFAULT_EXPENSE_GROUPS = [
  'Operating costs',
  'Premises & finance',
  'Bills & subscriptions',
  'Professional & statutory',
  'People',
  'Donations & other',
  'Module losses / costs',
]

export function emptyBranchLedger(): BranchLedgerPayload {
  return {
    formatVersion: 1,
    incomeGroups: [...DEFAULT_INCOME_GROUPS],
    expenseGroups: [...DEFAULT_EXPENSE_GROUPS],
    items: [],
    cashStart: 0,
    cashEnd: 0,
    profitStart: 0,
    profitEnd: 0,
    sourceSnapshot: [],
    sourceSummarySnapshot: [],
  }
}

export function emptyCompanyLedger(): CompanyLedgerPayload {
  return {
    formatVersion: 1,
    lmsStart: 0,
    lmsEnd: 0,
    suppliers: [],
    banks: [],
  }
}

export function displayMonth(month: string) {
  const parsed = new Date(`${month}-01T12:00:00Z`)
  if (Number.isNaN(parsed.valueOf())) return month
  return parsed.toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function previousMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function nextMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function branchTotals(payload: BranchLedgerPayload, sourceItems: LedgerItem[]) {
  const items = [...payload.items, ...sourceItems]
  const income = items
    .filter((item) => item.kind === 'income')
    .reduce((sum, item) => sum + item.amount, 0)
  const expenses = items
    .filter((item) => item.kind === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)
  const net = income - expenses
  return { income, expenses, net, profitEnd: payload.profitStart + net }
}

function carriedId(kind: string, id: string, month: string) {
  return `${kind}-carry-${month}-${id}`.slice(0, 180)
}

export function carryBranchLedger(
  previous: BranchLedgerPayload,
  fromMonth: string,
): BranchLedgerPayload {
  return {
    ...emptyBranchLedger(),
    incomeGroups: [...previous.incomeGroups],
    expenseGroups: [...previous.expenseGroups],
    items: previous.items.map((item) => ({
      ...item,
      id: carriedId(item.kind, item.id, fromMonth),
      carriedFrom: fromMonth,
      sourceKey: undefined,
    })),
    cashStart: 0,
    cashEnd: 0,
    profitStart: previous.profitEnd,
    profitEnd: previous.profitEnd,
  }
}

export function carryCompanyLedger(
  previous: CompanyLedgerPayload,
  fromMonth: string,
): CompanyLedgerPayload {
  const carryBalances = (balances: NamedBalance[]) =>
    balances.map((balance) => ({
      ...balance,
      id: carriedId('balance', balance.id, fromMonth),
      start: balance.end,
      end: balance.end,
      carriedFrom: fromMonth,
    }))
  return {
    formatVersion: 1,
    lmsStart: previous.lmsEnd,
    lmsEnd: previous.lmsEnd,
    suppliers: carryBalances(previous.suppliers),
    banks: carryBalances(previous.banks),
  }
}
