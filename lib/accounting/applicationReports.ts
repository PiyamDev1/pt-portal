export const APPLICATION_SOURCE_KEYS = ['nadra', 'pak_passport', 'gb_passport', 'visa'] as const

export type ApplicationSourceKey = (typeof APPLICATION_SOURCE_KEYS)[number]

export const APPLICATION_SOURCE_LABELS: Record<ApplicationSourceKey, string> = {
  nadra: 'NADRA',
  pak_passport: 'Pakistani Passport',
  gb_passport: 'GB Passport',
  visa: 'Visa',
}

export const REPORT_MONTHS = [
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

export type NormalizedApplication = {
  id: string
  source: ApplicationSourceKey
  application: string
  category: string
  appliedAt: string
  applicantName: string
  trackingNumber: string
  status: string
  deductionReason: 'Cancelled' | 'Refunded' | null
}

export type MonthlyApplicationCount = {
  month: number
  key: string
  label: string
  shortLabel: string
  total: number
  recorded: number
  cancelledOrRefunded: number
}

export type ApplicationReportDetail = {
  id: string
  applicantName: string
  trackingNumber: string
  status: string
  appliedAt: string
  deductionReason: 'Cancelled' | 'Refunded' | null
}

export type ApplicationReportRow = {
  application: string
  category: string
  total: number
  recorded: number
  cancelledOrRefunded: number
  monthlyCounts: number[]
  monthlyCancelledOrRefunded: number[]
  applications: ApplicationReportDetail[]
}

export type ApplicationReportSection = {
  source: ApplicationSourceKey
  label: string
  total: number
  recorded: number
  cancelledOrRefunded: number
  rows: ApplicationReportRow[]
}

export type AccountingApplicationsReport = {
  year: number
  service: ApplicationSourceKey | 'all'
  totals: {
    applications: number
    recordedApplications: number
    cancelledOrRefunded: number
    combinations: number
    averagePerMonth: number
    busiestMonth: MonthlyApplicationCount | null
  }
  months: MonthlyApplicationCount[]
  sections: ApplicationReportSection[]
  warnings: Array<{ label: string; message: string }>
}

type MutableApplicationReportRow = ApplicationReportRow & {
  source: ApplicationSourceKey
}

function rowKey(application: NormalizedApplication) {
  return `${application.source}\u0000${application.application}\u0000${application.category}`
}

function monthIndex(value: string, year: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() !== year) return null
  return date.getUTCMonth()
}

export function buildAccountingApplicationsReport({
  applications,
  year,
  service,
  warnings = [],
}: {
  applications: NormalizedApplication[]
  year: number
  service: ApplicationSourceKey | 'all'
  warnings?: Array<{ label: string; message: string }>
}): AccountingApplicationsReport {
  const monthlyTotals = Array.from({ length: 12 }, () => 0)
  const monthlyRecorded = Array.from({ length: 12 }, () => 0)
  const monthlyCancelledOrRefunded = Array.from({ length: 12 }, () => 0)
  const groupedRows = new Map<string, MutableApplicationReportRow>()
  let countedApplications = 0
  let recordedApplications = 0
  let cancelledOrRefunded = 0

  for (const application of applications) {
    const month = monthIndex(application.appliedAt, year)
    if (month === null) continue

    const isDeducted = application.deductionReason !== null
    recordedApplications += 1
    monthlyRecorded[month] += 1

    if (isDeducted) {
      cancelledOrRefunded += 1
      monthlyCancelledOrRefunded[month] += 1
    } else {
      countedApplications += 1
      monthlyTotals[month] += 1
    }

    const key = rowKey(application)
    const row = groupedRows.get(key) || {
      source: application.source,
      application: application.application,
      category: application.category,
      total: 0,
      recorded: 0,
      cancelledOrRefunded: 0,
      monthlyCounts: Array.from({ length: 12 }, () => 0),
      monthlyCancelledOrRefunded: Array.from({ length: 12 }, () => 0),
      applications: [],
    }

    row.recorded += 1
    row.applications.push({
      id: application.id,
      applicantName: application.applicantName,
      trackingNumber: application.trackingNumber,
      status: application.status,
      appliedAt: application.appliedAt,
      deductionReason: application.deductionReason,
    })

    if (isDeducted) {
      row.cancelledOrRefunded += 1
      row.monthlyCancelledOrRefunded[month] += 1
    } else {
      row.total += 1
      row.monthlyCounts[month] += 1
    }

    groupedRows.set(key, row)
  }

  const months = REPORT_MONTHS.map((month, index) => ({
    month: index + 1,
    key: `${year}-${String(index + 1).padStart(2, '0')}`,
    label: month.label,
    shortLabel: month.shortLabel,
    total: monthlyTotals[index],
    recorded: monthlyRecorded[index],
    cancelledOrRefunded: monthlyCancelledOrRefunded[index],
  }))

  const visibleSources =
    service === 'all'
      ? APPLICATION_SOURCE_KEYS
      : APPLICATION_SOURCE_KEYS.filter((key) => key === service)

  const sections = visibleSources.map((source) => {
    const rows = Array.from(groupedRows.values())
      .filter((row) => row.source === source)
      .map(({ source: _source, ...row }) => row)
      .map((row) => ({
        ...row,
        applications: [...row.applications].sort(
          (left, right) =>
            new Date(right.appliedAt || 0).getTime() - new Date(left.appliedAt || 0).getTime() ||
            left.applicantName.localeCompare(right.applicantName),
        ),
      }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          right.recorded - left.recorded ||
          left.application.localeCompare(right.application) ||
          left.category.localeCompare(right.category),
      )

    return {
      source,
      label: APPLICATION_SOURCE_LABELS[source],
      total: rows.reduce((sum, row) => sum + row.total, 0),
      recorded: rows.reduce((sum, row) => sum + row.recorded, 0),
      cancelledOrRefunded: rows.reduce((sum, row) => sum + row.cancelledOrRefunded, 0),
      rows,
    }
  })

  const busiestMonth = months.reduce<MonthlyApplicationCount | null>((busiest, month) => {
    if (!busiest || month.total > busiest.total) return month
    return busiest
  }, null)

  return {
    year,
    service,
    totals: {
      applications: countedApplications,
      recordedApplications,
      cancelledOrRefunded,
      combinations: groupedRows.size,
      averagePerMonth: Number((countedApplications / 12).toFixed(1)),
      busiestMonth: busiestMonth?.total ? busiestMonth : null,
    },
    months,
    sections,
    warnings,
  }
}
