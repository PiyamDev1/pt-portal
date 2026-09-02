import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BadgePoundSterling,
  CalendarCheck2,
  CheckCircle2,
  ChevronDown,
  FileCheck2,
  HandHelping,
  Info,
  PackageCheck,
  PlaneTakeoff,
  TrendingUp,
} from 'lucide-react'
import MyCommissionsView from '@/app/dashboard/my-commissions/MyCommissionsView'
import type { PerformanceMetricSet } from '@/lib/performance/analytics'
import type { MyPerformanceData } from '@/lib/performance/server'
import {
  performancePeriodHref,
  PERFORMANCE_TABS,
  type PerformanceView,
} from '@/lib/performance/view'

const number = new Intl.NumberFormat('en-GB')
const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDate(value: string | null) {
  if (!value) return 'No completed activity yet'
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(parsed.getTime()) ? value : date.format(parsed)
}

function hours(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes))
  return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, '0')}m`
}

function Trend({ current, previous }: { current: number; previous: number }) {
  if (current === previous) {
    return <span className="text-slate-500">Same as previous month</span>
  }
  if (previous === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <ArrowUpRight className="h-3.5 w-3.5" /> New in this period
      </span>
    )
  }
  const difference = current - previous
  const percentage = Math.round((Math.abs(difference) / previous) * 100)
  return (
    <span
      className={`inline-flex items-center gap-1 ${difference > 0 ? 'text-emerald-700' : 'text-slate-500'}`}
    >
      {difference > 0 ? (
        <ArrowUpRight className="h-3.5 w-3.5" />
      ) : (
        <ArrowDownRight className="h-3.5 w-3.5" />
      )}
      {percentage}% {difference > 0 ? 'more' : 'fewer'}
    </span>
  )
}

function MetricCard({
  label,
  value,
  previous,
  note,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  previous: number
  note: string
  icon: typeof PlaneTakeoff
  tone: 'red' | 'dark' | 'blue' | 'emerald'
}) {
  const toneClasses = {
    red: 'from-red-50 to-rose-100 text-[#8b1e2d]',
    dark: 'from-slate-100 to-zinc-200 text-slate-900',
    blue: 'from-blue-50 to-sky-100 text-blue-800',
    emerald: 'from-emerald-50 to-teal-100 text-emerald-800',
  }
  return (
    <article className="rounded-[1.45rem] border border-white bg-white p-5 shadow-sm ring-1 ring-slate-900/5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">
            {number.format(value)}
          </p>
        </div>
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${toneClasses[tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">{note}</p>
      <p className="mt-2 text-xs font-black">
        <Trend current={value} previous={previous} />
      </p>
    </article>
  )
}

function WorkTrendChart({ data }: { data: MyPerformanceData['analytics']['monthly'] }) {
  const totals = data.map(
    (item) =>
      item.ticketsIssued +
      item.ticketServices +
      item.ticketAssists +
      item.applications +
      item.packages,
  )
  const maximum = Math.max(1, ...totals)
  const segments = [
    { key: 'ticket', label: 'Ticket work', className: 'bg-[#8b1e2d]' },
    { key: 'assistance', label: 'Assistance', className: 'bg-amber-400' },
    { key: 'applications', label: 'Applications', className: 'bg-blue-500' },
    { key: 'packages', label: 'Packages', className: 'bg-emerald-500' },
  ] as const

  return (
    <>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs font-bold text-slate-500">
        {segments.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${segment.className}`} />
            {segment.label}
          </span>
        ))}
      </div>
      <div
        className="mt-5 grid h-64 grid-cols-6 items-end gap-2 sm:gap-4"
        role="img"
        aria-label={`Six month recorded work trend. ${data
          .map(
            (item) =>
              `${item.label}: ${item.ticketsIssued + item.ticketServices} ticket work, ${item.ticketAssists} assistance, ${item.applications} applications, ${item.packages} packages`,
          )
          .join('; ')}`}
      >
        {data.map((item, index) => {
          const values = {
            ticket: item.ticketsIssued + item.ticketServices,
            assistance: item.ticketAssists,
            applications: item.applications,
            packages: item.packages,
          }
          return (
            <div key={item.key} className="flex h-full min-w-0 flex-col justify-end text-center">
              <p className="mb-2 text-xs font-black text-slate-700">
                {number.format(totals[index])}
              </p>
              <div className="mx-auto flex h-48 w-full max-w-14 flex-col-reverse overflow-hidden rounded-t-xl bg-slate-100">
                {segments.map((segment) => {
                  const count = values[segment.key]
                  return (
                    <div
                      key={segment.key}
                      className={segment.className}
                      style={{
                        height: `${Math.max(count > 0 ? 4 : 0, (count / maximum) * 192)}px`,
                      }}
                      title={`${segment.label}: ${count}`}
                    />
                  )
                })}
              </div>
              <p className="mt-3 text-xs font-black text-slate-500">{item.label}</p>
            </div>
          )
        })}
      </div>
    </>
  )
}

function ticketWork(metrics: PerformanceMetricSet) {
  return metrics.ticketsIssued + metrics.ticketServices
}

function AttendanceCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>
    </article>
  )
}

export default function MyPerformanceView({
  data,
  employeeName,
  selectedView,
  selectedPeriod,
  currentPeriod,
}: {
  data: MyPerformanceData
  employeeName: string
  selectedView: PerformanceView
  selectedPeriod: string
  currentPeriod: string
}) {
  const { analytics } = data
  const firstName = employeeName.split(/\s+/)[0] || 'there'
  const current = analytics.current
  const previous = analytics.previous
  const attendance = analytics.attendance

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[1.9rem] bg-gradient-to-br from-[#4b0f16] via-[#7b1926] to-[#292b30] px-6 py-7 text-white shadow-xl shadow-red-950/20 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-[#d14b57]/25 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-red-100">
              My performance
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
              Your work, attendance and earnings in one place.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-red-50/80">
              Hi {firstName}. Choose a page for your attributed work, recorded attendance, or
              earnings under your commission agreement. Nothing here creates a score or compares you
              with another employee.
            </p>
          </div>
          <form
            action="/dashboard/my-performance"
            method="get"
            className="rounded-2xl bg-white/10 px-4 py-3 text-sm backdrop-blur"
          >
            <input type="hidden" name="view" value={selectedView} />
            <label
              htmlFor="performance-reporting-period"
              className="text-[10px] font-black uppercase tracking-[0.16em] text-red-100"
            >
              Reporting period
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id="performance-reporting-period"
                name="period"
                type="month"
                defaultValue={selectedPeriod}
                max={currentPeriod}
                className="min-w-0 rounded-lg border border-white/20 bg-white px-2.5 py-1.5 text-xs font-black text-slate-950 outline-none focus:border-white focus:ring-2 focus:ring-white/30"
              />
              <button
                type="submit"
                className="rounded-lg border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-black text-white transition hover:bg-white/25"
              >
                View
              </button>
            </div>
            <p className="mt-1.5 text-[10px] font-bold text-red-50/75">
              Showing {analytics.currentMonthLabel}
            </p>
          </form>
        </div>
        <nav className="relative mt-6 grid gap-2 sm:grid-cols-3" aria-label="My performance pages">
          {PERFORMANCE_TABS.map((tab) => {
            const active = tab.id === selectedView
            return (
              <Link
                key={tab.id}
                href={performancePeriodHref(tab.id, selectedPeriod)}
                aria-current={active ? 'page' : undefined}
                className={`rounded-xl border px-3.5 py-2.5 text-center text-xs font-black transition ${
                  active
                    ? 'border-white bg-white text-[#4b0f16] shadow-sm'
                    : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </section>

      {selectedView === 'activity' && (
        <section id="activity" className="scroll-mt-24 space-y-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8b1e2d]">
                Recorded activity
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Work completed in {analytics.currentMonthLabel}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Counts follow the current source record, so corrected, reversed, deleted and
                archived work is not retained as performance.
              </p>
            </div>
            {data.activityReady && (
              <p className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Last activity{' '}
                {formatDate(analytics.lastRecordedAt)}
              </p>
            )}
          </div>

          {!data.activityReady && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
              <Info className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-black">Activity reporting is being enabled</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Activity is unavailable rather than shown as zero until the reporting database
                  upgrade is installed.
                </p>
              </div>
            </div>
          )}

          {data.activityReady && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Ticket work"
                  value={ticketWork(current)}
                  previous={ticketWork(previous)}
                  note={`${number.format(current.ticketsIssued)} ticket${current.ticketsIssued === 1 ? '' : 's'} issued · ${number.format(current.ticketServices)} after-sales service${current.ticketServices === 1 ? '' : 's'} · ${number.format(current.ticketPassengers)} passengers`}
                  icon={PlaneTakeoff}
                  tone="red"
                />
                <MetricCard
                  label="Applications"
                  value={current.applications}
                  previous={previous.applications}
                  note="Completed applications attributed to you, even where commission is redirected."
                  icon={FileCheck2}
                  tone="blue"
                />
                <MetricCard
                  label="Packages"
                  value={current.packages}
                  previous={previous.packages}
                  note={`${number.format(current.packagePassengers)} passengers · linked group bookings count once`}
                  icon={PackageCheck}
                  tone="emerald"
                />
                <MetricCard
                  label="Ticket assistance"
                  value={current.ticketAssists}
                  previous={previous.ticketAssists}
                  note="Distinct issued tickets where you are recorded as an assisting agent."
                  icon={HandHelping}
                  tone="dark"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
                <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                        Six-month view
                      </p>
                      <h3 className="mt-1 text-xl font-black text-slate-950">
                        Recorded work trend
                      </h3>
                    </div>
                    <TrendingUp className="h-5 w-5 text-[#8b1e2d]" />
                  </div>
                  <WorkTrendChart data={analytics.monthly} />
                </article>

                <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                    Application mix
                  </p>
                  <h3 className="mt-1 text-xl font-black text-slate-950">
                    Completed in this period
                  </h3>
                  {analytics.applicationBreakdown.length === 0 ? (
                    <p className="mt-6 rounded-2xl bg-slate-50 p-5 text-sm leading-6 text-slate-500">
                      No completed application records are attributed to you in this period.
                    </p>
                  ) : (
                    <div className="mt-5 space-y-3">
                      {analytics.applicationBreakdown.map((item) => (
                        <div
                          key={item.kind}
                          className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3"
                        >
                          <span className="text-sm font-bold text-slate-700">{item.label}</span>
                          <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-[#8b1e2d] shadow-sm">
                            {number.format(item.count)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <details className="group overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden sm:px-6 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className="block text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                      Evidence
                    </span>
                    <span className="mt-1 block text-base font-black text-slate-950">
                      Recent completed work · {analytics.recent.length} item
                      {analytics.recent.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
                </summary>
                {analytics.recent.length === 0 ? (
                  <p className="border-t border-slate-100 px-6 py-8 text-center text-sm text-slate-500">
                    No completed work is available in this reporting period.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 border-t border-slate-100">
                    {analytics.recent.map((item) => (
                      <Link
                        key={item.id}
                        href={item.sourcePath}
                        className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-slate-50 sm:px-6"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">{item.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {item.description} · {formatDate(item.effectiveOn)}
                          </p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </Link>
                    ))}
                  </div>
                )}
              </details>
            </>
          )}
        </section>
      )}

      {selectedView === 'attendance' && (
        <section
          id="attendance"
          className="scroll-mt-24 rounded-[1.7rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
        >
          <div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Attendance
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Your recorded time
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Hours use completed IN-to-OUT pairs. Missing punches are never estimated.
              </p>
            </div>
          </div>

          {!data.attendanceReady && (
            <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Attendance reporting is currently unavailable. No zero values are being inferred.
            </p>
          )}
          {data.attendanceReady && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <AttendanceCard
                label="Recorded hours"
                value={hours(attendance.current.workedMinutes)}
                note={`${hours(attendance.previous.workedMinutes)} in the previous month`}
              />
              <AttendanceCard
                label="Days present"
                value={number.format(attendance.current.daysPresent)}
                note="Days containing a recorded clock-in"
              />
              <AttendanceCard
                label="Completed sessions"
                value={number.format(attendance.current.completedShifts)}
                note="Valid IN-to-OUT pairs in this reporting period"
              />
              <AttendanceCard
                label="Punch status"
                value={
                  attendance.hasOpenShift
                    ? 'Clocked in'
                    : attendance.incompletePunchCount > 0
                      ? 'Needs review'
                      : attendance.current.daysPresent > 0
                        ? 'Complete'
                        : 'No punches'
                }
                note={
                  attendance.incompletePunchCount > 0
                    ? `${attendance.incompletePunchCount} unmatched punch${attendance.incompletePunchCount === 1 ? '' : 'es'} in the six-month window`
                    : 'No unmatched punches in the six-month window'
                }
              />
            </div>
          )}

          {data.attendanceReady && (
            <details className="group mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-[11px] font-black uppercase tracking-[0.14em] text-[#8b1e2d]">
                    Evidence
                  </span>
                  <span className="mt-0.5 block text-sm font-black text-slate-800">
                    Recorded attendance · {number.format(attendance.current.daysPresent)} day
                    {attendance.current.daysPresent === 1 ? '' : 's'} present
                  </span>
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <div className="flex flex-col items-start gap-3 border-t border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-xs leading-5 text-slate-500">
                  These totals come from your recorded clock-in and clock-out events. Open the punch
                  history to review the underlying timestamps or request a correction.
                </p>
                <Link
                  href="/dashboard/timeclock/history"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-black text-slate-700 transition hover:border-red-200 hover:text-[#8b1e2d]"
                >
                  Review my punches <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </details>
          )}
        </section>
      )}

      {selectedView === 'earnings' && (
        <section id="earnings" className="scroll-mt-24 space-y-5">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-[#8b1e2d]">
              <BadgePoundSterling className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Earnings
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                Salary and commission
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                Commission follows the payment recipient in the agreement. It remains separate from
                the work attributed to you in the Activity tab.
              </p>
            </div>
          </div>
          <MyCommissionsView
            data={data.commission}
            employeeName={employeeName}
            embedded
            reportingPeriodLabel={analytics.currentMonthLabel}
          />
        </section>
      )}

      <aside className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-600">
        <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#8b1e2d]" />
        <p className="text-xs leading-5">
          This module is an employee record view, not a payslip, disciplinary score, target, or
          ranking. Questions about source attribution should be corrected in the originating module;
          earnings questions should be reviewed against the commission agreement.
        </p>
      </aside>
    </div>
  )
}
