export const TICKETING_SERVICE_TYPES = ['TK', 'DC', 'R-ER'] as const

export type TicketingServiceType = (typeof TICKETING_SERVICE_TYPES)[number]

export const TICKETING_SERVICE_LABELS: Record<TicketingServiceType, string> = {
  TK: 'Ticket sale',
  DC: 'Date change',
  'R-ER': 'Reissue / exchange',
}

export const TICKETING_REPORT_MONTHS = [
  { shortLabel: 'Jan', label: 'January' },
  { shortLabel: 'Feb', label: 'February' },
  { shortLabel: 'Mar', label: 'March' },
  { shortLabel: 'Apr', label: 'April' },
  { shortLabel: 'May', label: 'May' },
  { shortLabel: 'Jun', label: 'June' },
  { shortLabel: 'Jul', label: 'July' },
  { shortLabel: 'Aug', label: 'August' },
  { shortLabel: 'Sep', label: 'September' },
  { shortLabel: 'Oct', label: 'October' },
  { shortLabel: 'Nov', label: 'November' },
  { shortLabel: 'Dec', label: 'December' },
] as const

export type TicketingReportBranch = {
  id: string
  name: string
  branchCode: string | null
}

export type NormalizedTicketingTransaction = {
  id: string
  bookingId: string
  branchId: string
  pnr: string
  customerName: string
  airlineCode: string
  airlineName: string
  ownerName: string
  bookingDate: string
  serviceType: TicketingServiceType
  operationalStatus: string
  paymentStatus: string
  passengerCount: number
  saleGbp: number
  supplierCostGbp: number
}

export type TicketingReportDetail = NormalizedTicketingTransaction & {
  grossProfitGbp: number
}

export type MonthlyTicketingSummary = {
  month: number
  key: string
  label: string
  shortLabel: string
  transactions: number
  passengerTickets: number
  saleGbp: number
  supplierCostGbp: number
  grossProfitGbp: number
  paid: number
  partial: number
  unpaid: number
  held: number
}

export type TicketingReportRow = {
  airlineCode: string
  airlineName: string
  transactions: number
  passengerTickets: number
  saleGbp: number
  supplierCostGbp: number
  grossProfitGbp: number
  monthlyTransactions: number[]
  monthlyPassengerTickets: number[]
  monthlySaleGbp: number[]
  monthlySupplierCostGbp: number[]
  monthlyGrossProfitGbp: number[]
  tickets: TicketingReportDetail[]
}

export type TicketingReportSection = {
  branch: TicketingReportBranch
  transactions: number
  passengerTickets: number
  saleGbp: number
  supplierCostGbp: number
  grossProfitGbp: number
  rows: TicketingReportRow[]
}

export type AccountingTicketingReport = {
  year: number
  branchId: string | 'all'
  service: TicketingServiceType | 'all'
  branches: TicketingReportBranch[]
  totals: {
    transactions: number
    passengerTickets: number
    saleGbp: number
    supplierCostGbp: number
    grossProfitGbp: number
    paid: number
    partial: number
    unpaid: number
    held: number
    busiestMonth: MonthlyTicketingSummary | null
  }
  months: MonthlyTicketingSummary[]
  sections: TicketingReportSection[]
}

type MutableRow = TicketingReportRow & { branchId: string }

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function monthIndex(value: string, year: number) {
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year) return null
  return date.getUTCMonth()
}

function statusMatches(value: string, expected: string) {
  return value.trim().toLowerCase() === expected
}

export function buildAccountingTicketingReport({
  transactions,
  branches,
  year,
  branchId,
  service,
}: {
  transactions: NormalizedTicketingTransaction[]
  branches: TicketingReportBranch[]
  year: number
  branchId: string | 'all'
  service: TicketingServiceType | 'all'
}): AccountingTicketingReport {
  const monthly = TICKETING_REPORT_MONTHS.map((month, index) => ({
    month: index + 1,
    key: `${year}-${String(index + 1).padStart(2, '0')}`,
    label: month.label,
    shortLabel: month.shortLabel,
    transactions: 0,
    passengerTickets: 0,
    saleGbp: 0,
    supplierCostGbp: 0,
    grossProfitGbp: 0,
    paid: 0,
    partial: 0,
    unpaid: 0,
    held: 0,
  }))
  const rows = new Map<string, MutableRow>()
  let totalPaid = 0
  let totalPartial = 0
  let totalUnpaid = 0
  let totalHeld = 0

  for (const transaction of transactions) {
    const month = monthIndex(transaction.bookingDate, year)
    if (month === null) continue

    const grossProfitGbp = roundMoney(transaction.saleGbp - transaction.supplierCostGbp)
    const detail: TicketingReportDetail = { ...transaction, grossProfitGbp }
    const monthlySummary = monthly[month]
    monthlySummary.transactions += 1
    monthlySummary.passengerTickets += transaction.passengerCount
    monthlySummary.saleGbp += transaction.saleGbp
    monthlySummary.supplierCostGbp += transaction.supplierCostGbp
    monthlySummary.grossProfitGbp += grossProfitGbp

    if (statusMatches(transaction.paymentStatus, 'paid')) {
      totalPaid += 1
      monthlySummary.paid += 1
    } else if (
      statusMatches(transaction.paymentStatus, 'part_paid') ||
      statusMatches(transaction.paymentStatus, 'partial')
    ) {
      totalPartial += 1
      monthlySummary.partial += 1
    } else {
      totalUnpaid += 1
      monthlySummary.unpaid += 1
    }
    if (statusMatches(transaction.operationalStatus, 'held')) {
      totalHeld += 1
      monthlySummary.held += 1
    }

    const key = `${transaction.branchId}\u0000${transaction.airlineCode}\u0000${transaction.airlineName}`
    const row = rows.get(key) || {
      branchId: transaction.branchId,
      airlineCode: transaction.airlineCode,
      airlineName: transaction.airlineName,
      transactions: 0,
      passengerTickets: 0,
      saleGbp: 0,
      supplierCostGbp: 0,
      grossProfitGbp: 0,
      monthlyTransactions: Array.from({ length: 12 }, () => 0),
      monthlyPassengerTickets: Array.from({ length: 12 }, () => 0),
      monthlySaleGbp: Array.from({ length: 12 }, () => 0),
      monthlySupplierCostGbp: Array.from({ length: 12 }, () => 0),
      monthlyGrossProfitGbp: Array.from({ length: 12 }, () => 0),
      tickets: [],
    }
    row.transactions += 1
    row.passengerTickets += transaction.passengerCount
    row.saleGbp += transaction.saleGbp
    row.supplierCostGbp += transaction.supplierCostGbp
    row.grossProfitGbp += grossProfitGbp
    row.monthlyTransactions[month] += 1
    row.monthlyPassengerTickets[month] += transaction.passengerCount
    row.monthlySaleGbp[month] += transaction.saleGbp
    row.monthlySupplierCostGbp[month] += transaction.supplierCostGbp
    row.monthlyGrossProfitGbp[month] += grossProfitGbp
    row.tickets.push(detail)
    rows.set(key, row)
  }

  for (const month of monthly) {
    month.saleGbp = roundMoney(month.saleGbp)
    month.supplierCostGbp = roundMoney(month.supplierCostGbp)
    month.grossProfitGbp = roundMoney(month.grossProfitGbp)
  }

  const visibleBranches = branches.filter((branch) => branchId === 'all' || branch.id === branchId)
  const sections = visibleBranches.map((branch) => {
    const branchRows = Array.from(rows.values())
      .filter((row) => row.branchId === branch.id)
      .map(({ branchId: _branchId, ...row }) => ({
        ...row,
        saleGbp: roundMoney(row.saleGbp),
        supplierCostGbp: roundMoney(row.supplierCostGbp),
        grossProfitGbp: roundMoney(row.grossProfitGbp),
        monthlySaleGbp: row.monthlySaleGbp.map(roundMoney),
        monthlySupplierCostGbp: row.monthlySupplierCostGbp.map(roundMoney),
        monthlyGrossProfitGbp: row.monthlyGrossProfitGbp.map(roundMoney),
        tickets: [...row.tickets].sort(
          (left, right) =>
            right.bookingDate.localeCompare(left.bookingDate) || left.pnr.localeCompare(right.pnr),
        ),
      }))
      .sort(
        (left, right) =>
          right.transactions - left.transactions ||
          left.airlineName.localeCompare(right.airlineName),
      )

    return {
      branch,
      transactions: branchRows.reduce((sum, row) => sum + row.transactions, 0),
      passengerTickets: branchRows.reduce((sum, row) => sum + row.passengerTickets, 0),
      saleGbp: roundMoney(branchRows.reduce((sum, row) => sum + row.saleGbp, 0)),
      supplierCostGbp: roundMoney(branchRows.reduce((sum, row) => sum + row.supplierCostGbp, 0)),
      grossProfitGbp: roundMoney(branchRows.reduce((sum, row) => sum + row.grossProfitGbp, 0)),
      rows: branchRows,
    }
  })

  const totals = monthly.reduce(
    (result, month) => ({
      transactions: result.transactions + month.transactions,
      passengerTickets: result.passengerTickets + month.passengerTickets,
      saleGbp: result.saleGbp + month.saleGbp,
      supplierCostGbp: result.supplierCostGbp + month.supplierCostGbp,
      grossProfitGbp: result.grossProfitGbp + month.grossProfitGbp,
    }),
    { transactions: 0, passengerTickets: 0, saleGbp: 0, supplierCostGbp: 0, grossProfitGbp: 0 },
  )
  const busiestMonth = monthly.reduce<MonthlyTicketingSummary | null>((busiest, month) => {
    if (!busiest || month.transactions > busiest.transactions) return month
    return busiest
  }, null)

  return {
    year,
    branchId,
    service,
    branches,
    totals: {
      ...totals,
      saleGbp: roundMoney(totals.saleGbp),
      supplierCostGbp: roundMoney(totals.supplierCostGbp),
      grossProfitGbp: roundMoney(totals.grossProfitGbp),
      paid: totalPaid,
      partial: totalPartial,
      unpaid: totalUnpaid,
      held: totalHeld,
      busiestMonth: busiestMonth?.transactions ? busiestMonth : null,
    },
    months: monthly,
    sections,
  }
}
