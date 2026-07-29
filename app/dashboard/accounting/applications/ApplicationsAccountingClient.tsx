'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  BarChart3,
  CalendarDays,
  FileText,
  Maximize2,
  Minimize2,
  RefreshCw,
  Tags,
  TrendingUp,
} from 'lucide-react'
import type {
  AccountingApplicationsReport,
  ApplicationReportRow,
  ApplicationReportSection,
  ApplicationSourceKey,
} from '@/lib/accounting/applicationReports'

const SERVICE_OPTIONS: Array<{ value: ApplicationSourceKey | 'all'; label: string }> = [
  { value: 'all', label: 'All applications' },
  { value: 'nadra', label: 'NADRA' },
  { value: 'pak_passport', label: 'Pakistani Passport' },
  { value: 'gb_passport', label: 'GB Passport' },
  { value: 'visa', label: 'Visa' },
]

const SECTION_STYLES: Record<ApplicationSourceKey, { icon: string; badge: string; bar: string }> = {
  nadra: {
    icon: 'bg-emerald-100 text-emerald-700',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    bar: 'bg-emerald-600',
  },
  pak_passport: {
    icon: 'bg-amber-100 text-amber-700',
    badge: 'border-amber-200 bg-amber-50 text-amber-800',
    bar: 'bg-amber-500',
  },
  gb_passport: {
    icon: 'bg-blue-100 text-blue-700',
    badge: 'border-blue-200 bg-blue-50 text-blue-800',
    bar: 'bg-blue-600',
  },
  visa: {
    icon: 'bg-rose-100 text-rose-700',
    badge: 'border-rose-200 bg-rose-50 text-rose-800',
    bar: 'bg-rose-600',
  },
}

const now = new Date()
const CURRENT_YEAR = now.getUTCFullYear()
const CURRENT_MONTH_INDEX = now.getUTCMonth()
const YEAR_OPTIONS = Array.from({ length: 12 }, (_, index) => CURRENT_YEAR - index)

type SelectedDetails = {
  sectionLabel: string
  row: ApplicationReportRow
}

function formatAppliedDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('en-GB')
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof FileText
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <p className="mt-3 text-2xl font-black text-slate-950">{value}</p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  )
}

function ApplicationDetailsWindow({
  selected,
  year,
  selectedMonthIndex,
  selectedMonthLabel,
  onClose,
}: {
  selected: SelectedDetails | null
  year: number
  selectedMonthIndex: number
  selectedMonthLabel: string
  onClose: () => void
}) {
  useEffect(() => {
    if (!selected) return

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose, selected])

  if (!selected) return null

  const { row, sectionLabel } = selected
  const applications = row.applications.filter((application) => {
    const appliedAt = new Date(application.appliedAt)
    return (
      !Number.isNaN(appliedAt.getTime()) &&
      appliedAt.getUTCFullYear() === year &&
      appliedAt.getUTCMonth() === selectedMonthIndex
    )
  })
  const cancelledOrRefunded = row.monthlyCancelledOrRefunded[selectedMonthIndex] || 0
  const netApplied = row.monthlyCounts[selectedMonthIndex] || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/50"
        onClick={onClose}
        aria-label="Minimize applicant list"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="application-details-title"
        className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase text-slate-500">{sectionLabel}</p>
            <h2
              id="application-details-title"
              className="mt-1 truncate text-lg font-black text-slate-950"
            >
              {row.application}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {row.category} - {selectedMonthLabel} {year} applicant list
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100"
            aria-label="Minimize applicant list"
            title="Minimize"
          >
            <Minimize2 className="h-4 w-4" />
          </button>
        </header>

        <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50">
          <div className="px-3 py-3 text-center sm:px-5">
            <p className="text-[10px] font-black uppercase text-slate-500">Recorded</p>
            <p className="mt-1 text-lg font-black text-slate-950">{applications.length}</p>
          </div>
          <div className="border-x border-slate-200 px-3 py-3 text-center sm:px-5">
            <p className="text-[10px] font-black uppercase leading-tight text-red-600">
              Cancelled/<span className="block sm:inline">refunded</span>
            </p>
            <p className="mt-1 text-lg font-black text-red-700">{cancelledOrRefunded}</p>
          </div>
          <div className="px-3 py-3 text-center sm:px-5">
            <p className="text-[10px] font-black uppercase text-emerald-700">Net applied</p>
            <p className="mt-1 text-lg font-black text-emerald-800">{netApplied}</p>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)_8rem_8rem] gap-3 border-b border-slate-200 bg-white px-5 py-2.5 text-[10px] font-black uppercase text-slate-500 sm:grid">
            <span>Applicant</span>
            <span>Tracking number</span>
            <span>Applied</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-slate-100">
            {applications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                No applications recorded in {selectedMonthLabel} {year}.
              </p>
            ) : (
              applications.map((application) => (
                <div
                  key={`${application.id}-${application.trackingNumber}`}
                  className={`grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)_8rem_8rem] sm:items-center sm:px-5 ${
                    application.deductionReason ? 'bg-red-50/60' : 'bg-white'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {application.applicantName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 sm:hidden">
                      {formatAppliedDate(application.appliedAt)}
                    </p>
                  </div>
                  <p className="break-all font-mono text-xs font-semibold text-slate-700">
                    {application.trackingNumber}
                  </p>
                  <p className="hidden text-xs text-slate-600 sm:block">
                    {formatAppliedDate(application.appliedAt)}
                  </p>
                  <div>
                    <span
                      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-black ${
                        application.deductionReason
                          ? 'border-red-200 bg-red-100 text-red-800'
                          : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {application.deductionReason || application.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function SectionTable({
  section,
  selectedMonthIndex,
  selectedMonthLabel,
  year,
  onOpenDetails,
}: {
  section: ApplicationReportSection
  selectedMonthIndex: number
  selectedMonthLabel: string
  year: number
  onOpenDetails: (selected: SelectedDetails) => void
}) {
  const style = SECTION_STYLES[section.source]
  const rows = [...section.rows].sort(
    (left, right) =>
      right.monthlyCounts[selectedMonthIndex] - left.monthlyCounts[selectedMonthIndex] ||
      right.total - left.total ||
      left.application.localeCompare(right.application),
  )
  const selectedMonthTotal = rows.reduce(
    (sum, row) => sum + row.monthlyCounts[selectedMonthIndex],
    0,
  )
  const selectedMonthCancelledOrRefunded = rows.reduce(
    (sum, row) => sum + row.monthlyCancelledOrRefunded[selectedMonthIndex],
    0,
  )
  const maxSelectedCount = Math.max(...rows.map((row) => row.monthlyCounts[selectedMonthIndex]), 1)

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${style.icon}`}>
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-900">{section.label}</h2>
            <p className="text-xs text-slate-500">
              {section.recorded.toLocaleString()} applied in {year}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedMonthCancelledOrRefunded > 0 && (
            <span className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-black text-red-700">
              -{selectedMonthCancelledOrRefunded.toLocaleString()} cancelled/refunded
            </span>
          )}
          <span className={`rounded-md border px-2.5 py-1 text-xs font-black ${style.badge}`}>
            {selectedMonthTotal.toLocaleString()} net in {selectedMonthLabel}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-4 py-10 text-center text-sm text-slate-500">
          No applications recorded in {year}.
        </div>
      ) : (
        <>
          <div className="divide-y divide-slate-100 sm:hidden">
            {rows.map((row) => {
              const monthCount = row.monthlyCounts[selectedMonthIndex]
              const monthCancelledOrRefunded = row.monthlyCancelledOrRefunded[selectedMonthIndex]
              const monthRecorded = monthCount + monthCancelledOrRefunded
              return (
                <div key={`${row.application}-${row.category}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-black text-slate-900">{row.application}</p>
                      <p className="mt-1 text-sm text-slate-600">{row.category}</p>
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      <div className="text-right">
                        <p className="text-xl font-black text-slate-950">
                          {monthCount.toLocaleString()}
                        </p>
                        <p className="text-[11px] font-bold text-slate-500">{selectedMonthLabel}</p>
                        {monthCancelledOrRefunded > 0 && (
                          <p className="mt-1 text-[10px] font-black text-red-700">
                            -{monthCancelledOrRefunded} deducted
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenDetails({ sectionLabel: section.label, row })}
                        disabled={monthRecorded === 0}
                        className="flex h-9 min-w-9 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label={`Expand ${row.application} applicant list`}
                        title={
                          monthRecorded
                            ? `View ${monthRecorded} applications from ${selectedMonthLabel}`
                            : `No applications in ${selectedMonthLabel}`
                        }
                      >
                        <Maximize2 className="h-4 w-4" />
                        <span className="text-[10px] font-black">{monthRecorded}</span>
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${style.bar}`}
                        style={{ width: `${(monthCount / maxSelectedCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-slate-500">
                      {row.recorded.toLocaleString()} in {year}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-[11px] font-black uppercase text-slate-500">
                  <th className="px-4 py-3">What was applied</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3 text-right">Applied in {selectedMonthLabel}</th>
                  <th className="px-4 py-3 text-right">{year} total</th>
                  <th className="px-4 py-3 text-right">Applicants</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const monthCount = row.monthlyCounts[selectedMonthIndex]
                  const monthCancelledOrRefunded =
                    row.monthlyCancelledOrRefunded[selectedMonthIndex]
                  const monthRecorded = monthCount + monthCancelledOrRefunded
                  return (
                    <tr key={`${row.application}-${row.category}`} className="text-sm">
                      <td className="px-4 py-3 font-bold text-slate-900">{row.application}</td>
                      <td className="px-4 py-3 text-slate-700">{row.category}</td>
                      <td className="w-56 px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${style.bar}`}
                              style={{ width: `${(monthCount / maxSelectedCount) * 100}%` }}
                            />
                          </div>
                          <span className="w-10 text-right text-base font-black text-slate-950">
                            {monthCount.toLocaleString()}
                          </span>
                        </div>
                        {monthCancelledOrRefunded > 0 && (
                          <p className="mt-1 text-right text-[10px] font-black text-red-700">
                            -{monthCancelledOrRefunded} cancelled/refunded
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="font-bold text-slate-700">{row.recorded.toLocaleString()}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onOpenDetails({ sectionLabel: section.label, row })}
                          disabled={monthRecorded === 0}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Expand ${row.application} applicant list`}
                          title={
                            monthRecorded
                              ? `View ${monthRecorded} applications from ${selectedMonthLabel}`
                              : `No applications in ${selectedMonthLabel}`
                          }
                        >
                          <Maximize2 className="h-4 w-4" />
                          <span className="text-xs font-black">{monthRecorded}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}

function InitialLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 rounded-lg bg-white ring-1 ring-slate-200" />
        ))}
      </div>
      <div className="h-52 rounded-lg bg-white ring-1 ring-slate-200" />
      <div className="h-72 rounded-lg bg-white ring-1 ring-slate-200" />
    </div>
  )
}

export default function ApplicationsAccountingClient() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [service, setService] = useState<ApplicationSourceKey | 'all'>('all')
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(CURRENT_MONTH_INDEX)
  const [report, setReport] = useState<AccountingApplicationsReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [selectedDetails, setSelectedDetails] = useState<SelectedDetails | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadReport() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({ year: String(year), service })
        const response = await fetch(`/api/accounting/applications?${params}`, {
          signal: controller.signal,
        })
        const payload = (await response.json()) as AccountingApplicationsReport & {
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload.error || 'Unable to load application report')
        }

        setReport(payload)
      } catch (loadError) {
        if (controller.signal.aborted) return
        setError(
          loadError instanceof Error ? loadError.message : 'Unable to load application report',
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadReport()
    return () => controller.abort()
  }, [refreshVersion, service, year])

  const selectedMonth = report?.months[selectedMonthIndex]
  const maxMonthTotal = useMemo(
    () => Math.max(...(report?.months.map((month) => month.total) || [0]), 1),
    [report],
  )

  function changeYear(nextYear: number) {
    setYear(nextYear)
    setSelectedMonthIndex(nextYear === CURRENT_YEAR ? CURRENT_MONTH_INDEX : 0)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <Link href="/dashboard/accounting" className="hover:text-emerald-700">
              Accounting
            </Link>
            <span>/</span>
            <span>Applications</span>
          </div>
          <h1 className="mt-2 text-2xl font-black text-slate-950 sm:text-3xl">
            Application Reports
          </h1>
          <p className="mt-1 text-sm text-slate-500">Monthly application counts by category</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span className="sr-only">Report year</span>
            <select
              value={year}
              onChange={(event) => changeYear(Number(event.target.value))}
              className="bg-transparent text-sm font-bold text-slate-800 outline-none"
            >
              {YEAR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="rounded-lg border border-slate-200 bg-white px-3 py-2">
            <span className="sr-only">Application section</span>
            <select
              value={service}
              onChange={(event) => setService(event.target.value as ApplicationSourceKey | 'all')}
              className="bg-transparent text-sm font-bold text-slate-800 outline-none"
            >
              {SERVICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setRefreshVersion((version) => version + 1)}
            disabled={loading}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Refresh application report"
            title="Refresh report"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setRefreshVersion((version) => version + 1)}
            className="font-black hover:text-red-950"
          >
            Retry
          </button>
        </div>
      )}

      {!report && loading ? (
        <InitialLoading />
      ) : (
        report && (
          <>
            {report.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Some sections could not be loaded:{' '}
                {report.warnings.map((warning) => warning.label).join(', ')}.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Metric
                icon={FileText}
                label="Applied"
                value={report.totals.applications.toLocaleString()}
                detail={`During ${report.year}`}
              />
              <Metric
                icon={CalendarDays}
                label={selectedMonth?.label || 'Selected month'}
                value={(selectedMonth?.total || 0).toLocaleString()}
                detail={
                  selectedMonth
                    ? `${selectedMonth.recorded} recorded - ${selectedMonth.cancelledOrRefunded} cancelled/refunded`
                    : 'Applications applied'
                }
              />
              <Metric
                icon={Ban}
                label="Cancelled/refunded"
                value={(selectedMonth?.cancelledOrRefunded || 0).toLocaleString()}
                detail={`In ${selectedMonth?.label || 'selected month'}`}
              />
              <Metric
                icon={TrendingUp}
                label="Busiest month"
                value={report.totals.busiestMonth?.label || '-'}
                detail={
                  report.totals.busiestMonth
                    ? `${report.totals.busiestMonth.total.toLocaleString()} applied`
                    : 'No applications'
                }
              />
              <Metric
                icon={Tags}
                label="Categories"
                value={report.totals.combinations.toLocaleString()}
                detail={`${report.totals.averagePerMonth.toLocaleString()} monthly average`}
              />
            </div>

            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-slate-500" />
                  <h2 className="text-sm font-black text-slate-900">Monthly applications</h2>
                </div>
                {loading && <span className="text-xs font-bold text-blue-700">Refreshing</span>}
              </div>

              <div className="mt-4 overflow-x-auto pb-1">
                <div className="grid min-w-[720px] grid-cols-12 gap-2">
                  {report.months.map((month, index) => {
                    const selected = selectedMonthIndex === index
                    const barHeight =
                      month.total === 0 ? 3 : Math.max(10, (month.total / maxMonthTotal) * 80)

                    return (
                      <button
                        key={month.key}
                        type="button"
                        onClick={() => setSelectedMonthIndex(index)}
                        className={`flex h-32 min-w-0 flex-col items-center justify-end rounded-lg border px-1 pb-2 transition ${
                          selected
                            ? 'border-emerald-500 bg-emerald-50'
                            : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                        aria-pressed={selected}
                        title={`${month.label}: ${month.total.toLocaleString()} applied`}
                      >
                        <span className="mb-1 text-xs font-black text-slate-800">
                          {month.total.toLocaleString()}
                        </span>
                        <span
                          className={`w-full max-w-7 rounded-t ${
                            selected ? 'bg-emerald-600' : 'bg-slate-400'
                          }`}
                          style={{ height: `${barHeight}px` }}
                        />
                        <span className="mt-2 text-[11px] font-bold text-slate-600">
                          {month.shortLabel}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>

            <div className="space-y-4">
              {report.sections.map((section) => (
                <SectionTable
                  key={section.source}
                  section={section}
                  selectedMonthIndex={selectedMonthIndex}
                  selectedMonthLabel={selectedMonth?.label || 'month'}
                  year={report.year}
                  onOpenDetails={setSelectedDetails}
                />
              ))}
            </div>

            <ApplicationDetailsWindow
              selected={selectedDetails}
              year={report.year}
              selectedMonthIndex={selectedMonthIndex}
              selectedMonthLabel={selectedMonth?.label || 'Selected month'}
              onClose={() => setSelectedDetails(null)}
            />
          </>
        )
      )}
    </div>
  )
}
