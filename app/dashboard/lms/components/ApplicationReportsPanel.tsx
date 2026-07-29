'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Filter,
  FileText,
  RefreshCw,
  Tags,
} from 'lucide-react'
import { toast } from 'sonner'

type ServiceKey = 'nadra' | 'pak_passport' | 'gb_passport' | 'visa'

type ApplicationReportTotals = {
  applications: number
  active: number
  completed: number
  attention: number
  categories: number
}

type ServiceBreakdown = {
  serviceKey: ServiceKey
  serviceLabel: string
  total: number
  active: number
  completed: number
  attention: number
}

type CategoryBreakdown = {
  serviceKey: ServiceKey
  serviceLabel: string
  category: string
  count: number
  active: number
  completed: number
  attention: number
  latestAppliedAt: string
}

type StatusBreakdown = {
  serviceKey: ServiceKey
  serviceLabel: string
  status: string
  count: number
}

type RecentApplication = {
  id: string
  serviceKey: ServiceKey
  serviceLabel: string
  category: string
  status: string
  appliedAt: string
}

type TrendPoint = {
  date: string
  total: number
  byService: Partial<Record<ServiceKey, number>>
}

type ApplicationReportPayload = {
  range: {
    from: string
    to: string
  }
  service: ServiceKey | 'all'
  totals: ApplicationReportTotals
  byService: ServiceBreakdown[]
  byCategory: CategoryBreakdown[]
  byStatus: StatusBreakdown[]
  recentApplications: RecentApplication[]
  trend: TrendPoint[]
  warnings: Array<{ label: string; message: string }>
}

const SERVICE_BADGES: Record<ServiceKey, string> = {
  nadra: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pak_passport: 'bg-green-50 text-green-800 border-green-200',
  gb_passport: 'bg-blue-50 text-blue-800 border-blue-200',
  visa: 'bg-violet-50 text-violet-700 border-violet-200',
}

const STATUS_BADGES: Record<string, string> = {
  'Pending Submission': 'bg-amber-50 text-amber-700 border-amber-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Progress': 'bg-violet-50 text-violet-700 border-violet-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
  'Biometrics Taken': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  Processing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Approved: 'bg-teal-50 text-teal-700 border-teal-200',
  'Passport Arrived': 'bg-orange-50 text-orange-700 border-orange-200',
  Collected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
}

const EMPTY_REPORT: ApplicationReportPayload = {
  range: { from: '', to: '' },
  service: 'all',
  totals: {
    applications: 0,
    active: 0,
    completed: 0,
    attention: 0,
    categories: 0,
  },
  byService: [],
  byCategory: [],
  byStatus: [],
  recentApplications: [],
  trend: [],
  warnings: [],
}

const SERVICE_OPTIONS: Array<{ value: ServiceKey | 'all'; label: string }> = [
  { value: 'all', label: 'All Services' },
  { value: 'nadra', label: 'NADRA' },
  { value: 'pak_passport', label: 'Pakistani Passport' },
  { value: 'gb_passport', label: 'GB Passport' },
  { value: 'visa', label: 'Visa' },
]

const RANGE_PRESETS = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'YTD', days: null },
]

function defaultDateRange() {
  const now = new Date()
  const from = new Date(now)
  from.setDate(from.getDate() - 29)
  return {
    from: from.toISOString().slice(0, 10),
    to: now.toISOString().slice(0, 10),
  }
}

function dateInputValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getPresetRange(days: number | null) {
  const now = new Date()
  if (days === null) {
    return {
      from: `${now.getFullYear()}-01-01`,
      to: dateInputValue(now),
    }
  }

  const from = new Date(now)
  from.setDate(from.getDate() - (days - 1))
  return {
    from: dateInputValue(from),
    to: dateInputValue(now),
  }
}

function formatDate(value: string) {
  if (!value) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB')
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof FileText
  label: string
  value: number
  tone: string
}) {
  return (
    <div className={`rounded-lg border p-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase text-slate-500">{label}</span>
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-2xl font-black text-slate-900">{value.toLocaleString()}</p>
    </div>
  )
}

function ServiceBadge({ item }: { item: Pick<CategoryBreakdown, 'serviceKey' | 'serviceLabel'> }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${SERVICE_BADGES[item.serviceKey]}`}
    >
      {item.serviceLabel}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const badge = STATUS_BADGES[status] || 'bg-slate-50 text-slate-700 border-slate-200'
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge}`}>
      {status}
    </span>
  )
}

export function ApplicationReportsPanel() {
  const initialRange = useMemo(() => defaultDateRange(), [])
  const [from, setFrom] = useState(initialRange.from)
  const [to, setTo] = useState(initialRange.to)
  const [service, setService] = useState<ServiceKey | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ApplicationReportPayload>(EMPTY_REPORT)

  const loadReport = useCallback(async () => {
    if (from && to && from > to) {
      toast.error('Choose a date range where From is before To')
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams({ from, to, service })
      const response = await fetch(`/api/lms/application-reports?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load application reports')
      setReport(payload)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load application reports')
      setReport(EMPTY_REPORT)
    } finally {
      setLoading(false)
    }
  }, [from, service, to])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  const [showAllCategories, setShowAllCategories] = useState(false)
  const categories = showAllCategories ? report.byCategory : report.byCategory.slice(0, 8)
  const topStatuses = report.byStatus.slice(0, 8)
  const maxCategoryCount = Math.max(...categories.map((item) => item.count), 1)
  const maxTrendTotal = Math.max(...report.trend.map((item) => item.total), 1)
  const hasReportData = report.totals.applications > 0
  const rangeIsInvalid = !!from && !!to && from > to

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-slate-700" />
              <h2 className="text-lg font-black text-slate-900">Application Reports</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Applied services by category, status, and source for the selected period.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-slate-600">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={service}
                onChange={(event) => setService(event.target.value as ServiceKey | 'all')}
                className="bg-transparent text-sm font-semibold text-slate-700 focus:outline-none"
                aria-label="Filter application report by service"
              >
                {SERVICE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
              />
            </label>
            <span className="hidden text-xs text-slate-400 sm:block">to</span>
            <input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
            />
            <button
              onClick={loadReport}
              disabled={loading || rangeIsInvalid}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                const range = getPresetRange(preset.days)
                setFrom(range.from)
                setTo(range.to)
              }}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              {preset.label}
            </button>
          ))}
          {rangeIsInvalid && (
            <span className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
              Invalid date range
            </span>
          )}
          {loading && hasReportData && (
            <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
              Refreshing report...
            </span>
          )}
        </div>

        {report.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Some application sources could not be loaded. Showing available report data.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryTile
            icon={FileText}
            label="Applied"
            value={report.totals.applications}
            tone="bg-slate-50 border-slate-200"
          />
          <SummaryTile
            icon={Activity}
            label="Active"
            value={report.totals.active}
            tone="bg-blue-50 border-blue-200"
          />
          <SummaryTile
            icon={CheckCircle2}
            label="Completed"
            value={report.totals.completed}
            tone="bg-emerald-50 border-emerald-200"
          />
          <SummaryTile
            icon={AlertTriangle}
            label="Attention"
            value={report.totals.attention}
            tone="bg-amber-50 border-amber-200"
          />
          <SummaryTile
            icon={Tags}
            label="Categories"
            value={report.totals.categories}
            tone="bg-violet-50 border-violet-200"
          />
        </div>

        {report.trend.length > 0 && (
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-slate-800">Daily Applied Volume</h3>
              <span className="text-xs text-slate-500">{report.trend.length} active days</span>
            </div>
            <div className="mt-4 flex h-28 items-end gap-1 overflow-x-auto pb-1">
              {report.trend.slice(-45).map((point) => (
                <div
                  key={point.date}
                  className="flex min-w-5 flex-1 flex-col items-center justify-end gap-1"
                  title={`${formatDate(point.date)}: ${point.total} applied`}
                >
                  <div
                    className="w-full min-w-3 rounded-t bg-slate-700"
                    style={{ height: `${Math.max(8, (point.total / maxTrendTotal) * 88)}px` }}
                  />
                  <span className="text-[9px] font-semibold text-slate-400">
                    {Number(point.date.slice(8, 10))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-black text-slate-800">Category Counts</h3>
              <span className="text-xs text-slate-500">
                {report.range.from || from} to {report.range.to || to}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3 text-right">Applied</th>
                    <th className="px-4 py-3 text-right">Active</th>
                    <th className="px-4 py-3 text-right">Done</th>
                    <th className="px-4 py-3 text-right">Latest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                        Loading application report...
                      </td>
                    </tr>
                  ) : categories.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                        No applications found for this period.
                      </td>
                    </tr>
                  ) : (
                    categories.map((item) => (
                      <tr key={`${item.serviceKey}-${item.category}`} className="text-sm">
                        <td className="max-w-[280px] px-4 py-3">
                          <span className="line-clamp-2 font-semibold text-slate-800">
                            {item.category}
                          </span>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-slate-700"
                              style={{ width: `${(item.count / maxCategoryCount) * 100}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <ServiceBadge item={item} />
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {item.count.toLocaleString()}
                          <span className="ml-1 text-[10px] font-semibold text-slate-400">
                            {report.totals.applications > 0
                              ? `${Math.round((item.count / report.totals.applications) * 100)}%`
                              : '0%'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {item.active.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {item.completed.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {formatDate(item.latestAppliedAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {report.byCategory.length > 8 && (
              <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 text-right">
                <button
                  onClick={() => setShowAllCategories((value) => !value)}
                  className="text-xs font-bold text-slate-700 hover:text-slate-950"
                >
                  {showAllCategories
                    ? 'Show fewer categories'
                    : `Show all ${report.byCategory.length} categories`}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-black text-slate-800">Source Totals</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {report.byService.length === 0 && !loading ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-400">
                    No source data.
                  </div>
                ) : (
                  report.byService.map((item) => (
                    <div key={item.serviceKey} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <ServiceBadge item={item} />
                        <span className="text-lg font-black text-slate-900">
                          {item.total.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-slate-500">
                        <span>Active {item.active}</span>
                        <span>Done {item.completed}</span>
                        <span>Attention {item.attention}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-slate-700"
                          style={{
                            width: `${
                              report.totals.applications > 0
                                ? (item.total / report.totals.applications) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h3 className="text-sm font-black text-slate-800">Status Mix</h3>
              </div>
              <div className="divide-y divide-slate-100">
                {topStatuses.length === 0 && !loading ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-400">
                    No status data.
                  </div>
                ) : (
                  topStatuses.map((item) => (
                    <div
                      key={`${item.serviceKey}-${item.status}`}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <StatusBadge status={item.status} />
                        <p className="mt-1 truncate text-[11px] text-slate-500">
                          {item.serviceLabel}
                        </p>
                      </div>
                      <span className="text-base font-black text-slate-900">
                        {item.count.toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {report.recentApplications.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
              <h3 className="text-sm font-black text-slate-800">Recently Applied</h3>
            </div>
            <div className="grid divide-y divide-slate-100 md:grid-cols-2 md:divide-x md:divide-y-0">
              {report.recentApplications.slice(0, 6).map((item) => (
                <div key={`${item.serviceKey}-${item.id}`} className="flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{item.category}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <ServiceBadge item={item} />
                      <StatusBadge status={item.status} />
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDate(item.appliedAt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
