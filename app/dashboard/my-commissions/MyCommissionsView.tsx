import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Info,
  Sparkles,
  TrendingUp,
  WalletCards,
} from 'lucide-react'
import type { MyCommissionData } from '@/lib/commissions/server'
import type { CommissionRate } from '@/lib/commissions/contracts'

const money = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  minimumFractionDigits: 2,
})

const shortMoney = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

function payMoney(currency: string) {
  return new Intl.NumberFormat(currency === 'PKR' ? 'en-PK' : 'en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  })
}

const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDate(value: string | null) {
  if (!value) return 'Not yet calculated'
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(parsed.getTime()) ? value : date.format(parsed)
}

function formatRate(
  rate: CommissionRate,
  packageRate = false,
  currency = 'GBP',
  eventNoun = 'booking',
) {
  const formatter = payMoney(currency)
  if (rate.kind === 'none') return 'No commission'
  if (rate.kind === 'full_difference') return 'Full supplier fare increase'
  if (rate.kind === 'percentage')
    return `${rate.value}% of ${packageRate ? 'final profit' : 'value'}`
  if (rate.kind === 'per_event')
    return `${formatter.format(rate.value)} per ${packageRate ? 'package' : eventNoun}`
  if (rate.kind === 'per_unit')
    return `${formatter.format(rate.value)} per ${packageRate ? 'passenger' : 'ticket'}`
  return `${rate.tiers.length} volume tier${rate.tiers.length === 1 ? '' : 's'}`
}

function StatCard({
  label,
  value,
  note,
  tone = 'dark',
  icon: Icon,
}: {
  label: string
  value: string
  note: string
  tone?: 'dark' | 'red' | 'white'
  icon: typeof WalletCards
}) {
  const styles = {
    dark: 'bg-[#17181b] text-white border-black/10',
    red: 'bg-gradient-to-br from-[#781522] to-[#ab2436] text-white border-red-950/10',
    white: 'bg-white text-slate-950 border-slate-200',
  }
  return (
    <article className={`rounded-[1.4rem] border p-5 shadow-sm ${styles[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p
            className={`text-xs font-black uppercase tracking-[0.16em] ${tone === 'white' ? 'text-slate-500' : 'text-white/65'}`}
          >
            {label}
          </p>
          <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
        </div>
        <div
          className={`rounded-2xl p-2.5 ${tone === 'white' ? 'bg-red-50 text-[#8b1e2d]' : 'bg-white/10 text-white'}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p
        className={`mt-3 text-xs leading-5 ${tone === 'white' ? 'text-slate-500' : 'text-white/65'}`}
      >
        {note}
      </p>
    </article>
  )
}

function MonthlyChart({ data }: { data: MyCommissionData['analytics']['monthly'] }) {
  const maximum = Math.max(1, ...data.flatMap((item) => [item.creditsGbp, item.debitsGbp]))

  return (
    <div
      className="mt-6 grid h-60 grid-cols-6 items-end gap-2 sm:gap-4"
      role="img"
      aria-label={`Commission by month: ${data
        .map((item) => `${item.label} ${money.format(item.netGbp)}`)
        .join(', ')}`}
    >
      {data.map((item) => {
        const creditHeight = Math.max(
          item.creditsGbp > 0 ? 6 : 0,
          (item.creditsGbp / maximum) * 168,
        )
        const debitHeight = Math.max(item.debitsGbp > 0 ? 4 : 0, (item.debitsGbp / maximum) * 168)
        return (
          <div key={item.key} className="flex h-full min-w-0 flex-col justify-end text-center">
            <div className="mb-2 truncate text-[10px] font-bold text-slate-500 sm:text-xs">
              {shortMoney.format(item.netGbp)}
            </div>
            <div className="relative mx-auto flex h-44 w-full max-w-12 items-end overflow-hidden rounded-t-xl bg-slate-100">
              <div
                className="w-full rounded-t-xl bg-gradient-to-t from-[#711522] to-[#c43b42] transition-[height]"
                style={{ height: `${creditHeight}px` }}
              />
              {item.debitsGbp > 0 && (
                <div
                  className="absolute inset-x-0 bottom-0 bg-slate-800/80"
                  style={{ height: `${debitHeight}px` }}
                />
              )}
            </div>
            <div className="mt-3 text-xs font-black text-slate-600">{item.label}</div>
          </div>
        )
      })}
    </div>
  )
}

function EmptyState({
  schemaReady,
  scheduledProfile,
  embedded,
}: {
  schemaReady: boolean
  scheduledProfile: MyCommissionData['scheduledProfile']
  embedded: boolean
}) {
  const Heading = embedded ? 'h3' : 'h2'
  return (
    <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-[#8b1e2d]">
        <Clock3 className="h-7 w-7" />
      </div>
      <Heading className="mt-5 text-xl font-black text-slate-950">
        {scheduledProfile
          ? 'Your commission plan is scheduled'
          : schemaReady
            ? 'Your commission plan is being prepared'
            : 'Commission setup is being upgraded'}
      </Heading>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
        {scheduledProfile
          ? `${scheduledProfile.label} starts ${formatDate(scheduledProfile.effectiveFrom)}. Calculated activity will appear here after it becomes effective.`
          : schemaReady
            ? 'There is no active commission plan on your account yet. Once an administrator schedules one, its rates and calculated activity will appear here.'
            : 'The new employee commission workspace is not available in the database yet. No figures are being presented as payable during the upgrade.'}
      </p>
    </div>
  )
}

export default function MyCommissionsView({
  data,
  employeeName,
  embedded = false,
  reportingPeriodLabel,
}: {
  data: MyCommissionData
  employeeName: string
  embedded?: boolean
  reportingPeriodLabel?: string
}) {
  const { analytics } = data
  const preview = Boolean(data.profile) && analytics.mode === 'shadow'
  const live = Boolean(data.profile) && analytics.mode === 'live'
  const statusLabel = live
    ? 'Live'
    : preview
      ? 'Preview only'
      : data.schemaReady
        ? 'No calculations yet'
        : 'Unavailable'
  const statusClass = live
    ? 'bg-emerald-300 text-emerald-950'
    : preview
      ? 'bg-amber-300 text-amber-950'
      : 'bg-slate-200 text-slate-700'
  const firstName = employeeName.split(/\s+/)[0] || 'there'
  const profile = data.profile?.configuration
  const SectionHeading = embedded ? 'h3' : 'h2'

  return (
    <div className="space-y-6">
      {!embedded && (
        <section className="relative overflow-hidden rounded-[1.8rem] bg-[#4b0f16] px-6 py-7 text-white shadow-xl shadow-red-950/15 sm:px-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#d14b57]/25 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-red-100">
                  My commissions
                </p>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass}`}
                >
                  {statusLabel}
                </span>
              </div>
              <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Your earnings, clearly explained.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-red-50/80">
                Hi {firstName}. See what contributed to your commission and the plan used to
                calculate it.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-xs text-red-50">
              <Clock3 className="h-4 w-4" />
              Updated {formatDate(data.lastCalculatedAt)}
            </div>
          </div>
        </section>
      )}

      {embedded && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass}`}
          >
            {statusLabel}
          </span>
          <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-500">
            <Clock3 className="h-4 w-4" /> Updated {formatDate(data.lastCalculatedAt)}
          </span>
        </div>
      )}

      {preview && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
          <Info className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="text-sm font-black">These figures are a calculation preview</p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              They are not a payslip, payment promise, or approved payroll amount. Adjustments and
              validation may still change them.
            </p>
          </div>
        </div>
      )}

      {!data.profile ? (
        <EmptyState
          schemaReady={data.schemaReady}
          scheduledProfile={data.scheduledProfile}
          embedded={embedded}
        />
      ) : (
        <>
          <section className="rounded-[1.6rem] border border-emerald-200 bg-emerald-50 p-5 shadow-sm sm:p-6">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-800">
                  {reportingPeriodLabel
                    ? `${reportingPeriodLabel} local pay view`
                    : "This month's local pay view"}
                </p>
                <SectionHeading className="mt-1 text-xl font-black text-emerald-950">
                  Salary and commission in {data.compensation.currency}
                </SectionHeading>
                <p className="mt-1 text-xs leading-5 text-emerald-800">
                  Your agreed local amounts stay unchanged. The GBP figure is the accounting value
                  produced from the administrator&apos;s month-end remittance rate.
                </p>
              </div>
              {data.compensation.ratePending ? (
                <span className="rounded-full bg-amber-200 px-3 py-1.5 text-xs font-black text-amber-950">
                  Awaiting the selected period&apos;s {data.compensation.currency} / GBP rate
                </span>
              ) : (
                <span className="rounded-full bg-emerald-200 px-3 py-1.5 text-xs font-black text-emerald-950">
                  {data.compensation.unitsPerGbp?.toLocaleString('en-GB', {
                    maximumFractionDigits: 6,
                  })}{' '}
                  {data.compensation.currency} per £1
                </span>
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Monthly salary', data.compensation.monthlySalary],
                ['Commission', data.compensation.currentMonthCommission],
                ['Local gross total', data.compensation.currentMonthGrossPay],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-2xl border border-emerald-200 bg-white p-4"
                >
                  <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">
                    {label}
                  </p>
                  <p className="mt-2 text-xl font-black text-slate-950">
                    {payMoney(data.compensation.currency).format(Number(value))}
                  </p>
                </div>
              ))}
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-white">
                <p className="text-[11px] font-black uppercase tracking-wide text-white/60">
                  GBP book equivalent
                </p>
                <p className="mt-2 text-xl font-black">
                  {data.compensation.currentMonthBookGbp === null
                    ? 'Pending rate'
                    : money.format(data.compensation.currentMonthBookGbp)}
                </p>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={reportingPeriodLabel || 'This month'}
              value={money.format(analytics.currentMonth.netGbp)}
              note={`${analytics.currentMonth.entryCount} calculated item${analytics.currentMonth.entryCount === 1 ? '' : 's'}`}
              icon={WalletCards}
              tone="red"
            />
            <StatCard
              label="Credits"
              value={money.format(analytics.currentMonth.creditsGbp)}
              note="Positive earnings in the selected period"
              icon={ArrowUpRight}
            />
            <StatCard
              label="Deductions"
              value={money.format(analytics.currentMonth.debitsGbp)}
              note="Supplier fare increase or correction adjustments"
              icon={ArrowDownRight}
              tone="white"
            />
            <StatCard
              label="Year to date"
              value={money.format(analytics.yearToDateGbp)}
              note={
                reportingPeriodLabel
                  ? `Net calculated commission through ${reportingPeriodLabel}`
                  : 'Net calculated commission this calendar year'
              }
              icon={TrendingUp}
              tone="white"
            />
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(20rem,0.8fr)]">
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                    Six-month view
                  </p>
                  <SectionHeading className="mt-1 text-xl font-black text-slate-950">
                    Calculated earnings · GBP book view
                  </SectionHeading>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#a32234]" />
                    Credits
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-800" />
                    Debits
                  </span>
                </div>
              </div>
              <MonthlyChart data={analytics.monthly} />
            </article>

            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Breakdown
              </p>
              <SectionHeading className="mt-1 text-xl font-black text-slate-950">
                Where it came from
              </SectionHeading>
              <div className="mt-6 space-y-5">
                {analytics.breakdown.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">
                    No calculated activity yet.
                  </p>
                ) : (
                  analytics.breakdown.slice(0, 6).map((item) => (
                    <div key={item.code}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-slate-700">{item.label}</span>
                        <span className="font-black text-slate-950">
                          {money.format(item.amountGbp)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[#741522] to-[#c43b42]"
                          style={{ width: `${Math.max(2, item.percentage)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {item.entryCount} item{item.entryCount === 1 ? '' : 's'} · {item.percentage}
                        %
                      </p>
                    </div>
                  ))
                )}
              </div>
            </article>
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(20rem,0.8fr)_minmax(0,1.55fr)]">
            <article className="rounded-[1.6rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                    Your commission plan
                  </p>
                  <SectionHeading className="mt-1 text-xl font-black text-slate-950">
                    {data.profile.label}
                  </SectionHeading>
                </div>
                <FileText className="h-6 w-6 text-slate-300" />
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                <CalendarDays className="h-4 w-4 text-[#8b1e2d]" />
                Effective from {formatDate(data.profile.effectiveFrom)}
              </div>
              {profile ? (
                <div className="mt-5 divide-y divide-slate-100">
                  {(
                    [
                      ['Ticket sales', profile.services.tkPrimary],
                      ['Ticket assistance', profile.services.tkAssistance],
                      ['Date changes', profile.services.dateChange],
                      ['Reissues', profile.services.reissue],
                      ['Low-fare savings', profile.services.lowFare],
                      ['Supplier fare increase adjustment', profile.services.higherFare],
                      ['Package sales', profile.services.packageSale, true],
                      [
                        'NADRA applications - normal',
                        profile.services.applicationNadra,
                        false,
                        'completed application',
                      ],
                      [
                        'NADRA applications - urgent',
                        profile.services.applicationNadraUrgent,
                        false,
                        'completed application',
                      ],
                      [
                        'Pakistani passport applications - normal',
                        profile.services.applicationPassportPk,
                        false,
                        'collected application',
                      ],
                      [
                        'Pakistani passport applications - urgent',
                        profile.services.applicationPassportPkUrgent,
                        false,
                        'collected application',
                      ],
                      [
                        'British passport applications',
                        profile.services.applicationPassportGb,
                        false,
                        'completed application',
                      ],
                      [
                        'Visa applications',
                        profile.services.applicationVisa,
                        false,
                        'completed application',
                      ],
                    ] as Array<[string, CommissionRate, boolean?, string?]>
                  )
                    .filter(
                      ([label]) =>
                        profile.applicationRouting.mode === 'self' ||
                        !label.toLowerCase().includes('applications'),
                    )
                    .map(([label, rate, packageRate, eventNoun]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-4 py-3 text-sm"
                      >
                        <span className="text-slate-500">{label}</span>
                        <span className="text-right font-black text-slate-800">
                          {formatRate(
                            rate,
                            packageRate,
                            rate.currency || profile.compensation.currency,
                            eventNoun,
                          )}
                        </span>
                      </div>
                    ))}
                  <div className="flex items-start justify-between gap-4 py-3 text-sm">
                    <span className="text-slate-500">Application commission</span>
                    <span className="max-w-xs text-right font-black text-slate-800">
                      {profile.applicationRouting.mode === 'self'
                        ? 'Paid to you at the rates above'
                        : profile.applicationRouting.mode === 'none'
                          ? 'No commission is paid'
                          : `Paid to ${
                              data.profile.applicationRoutingRecipientName || 'another employee'
                            } at their own rate`}
                    </span>
                  </div>
                  {profile.services.tkAssistance.kind !== 'none' && (
                    <div className="flex items-center justify-between gap-4 py-3 text-sm">
                      <span className="text-slate-500">Ticket assistance scope</span>
                      <span className="text-right font-black text-slate-800">
                        {profile.assistanceScope.mode === 'all'
                          ? 'All primary agents'
                          : `${profile.assistanceScope.employeeIds.length} selected primary agent${profile.assistanceScope.employeeIds.length === 1 ? '' : 's'}`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 py-3 text-sm">
                    <span className="text-slate-500">Monthly profit bonus</span>
                    <span className="text-right font-black text-slate-800">
                      {profile.monthlyBonus.enabled
                        ? `From ${money.format(profile.monthlyBonus.thresholdGbp)}`
                        : 'Not included'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                  The detailed commission plan is not available in this version.
                </p>
              )}
              {data.scheduledProfile && (
                <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-950">
                  <div className="flex gap-3">
                    <Sparkles className="h-5 w-5 shrink-0 text-blue-600" />
                    <div>
                      <p className="text-sm font-black">A new commission plan is scheduled</p>
                      <p className="mt-1 text-xs text-blue-800">
                        {data.scheduledProfile.label} starts{' '}
                        {formatDate(data.scheduledProfile.effectiveFrom)}.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </article>

            <details className="group overflow-hidden rounded-[1.6rem] border border-slate-200 bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 marker:hidden sm:px-6 [&::-webkit-details-marker]:hidden">
                <span>
                  <span className="block text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                    Evidence
                  </span>
                  <span className="mt-1 block text-base font-black text-slate-950">
                    Recent calculations · {analytics.recent.length} item
                    {analytics.recent.length === 1 ? '' : 's'}
                  </span>
                </span>
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              {analytics.recent.length === 0 ? (
                <div className="border-t border-slate-100 px-6 py-8 text-center text-sm text-slate-500">
                  No commission items have been calculated for this reporting period.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border-t border-slate-100">
                  {analytics.recent.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${entry.amountGbp >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-[#8b1e2d]'}`}
                        >
                          {entry.amountGbp >= 0 ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <AlertCircle className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-800">
                            {entry.description}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {formatDate(entry.earningOn)}
                            {entry.sourcePath ? ` · ${entry.sourcePath}` : ''}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-black ${entry.amountGbp >= 0 ? 'text-emerald-700' : 'text-[#8b1e2d]'}`}
                      >
                        {entry.amountGbp >= 0 ? '+' : '-'}
                        {entry.payCurrency && entry.amountPayCurrency !== undefined
                          ? payMoney(entry.payCurrency).format(Math.abs(entry.amountPayCurrency))
                          : money.format(Math.abs(entry.amountGbp))}
                        {entry.payCurrency && entry.payCurrency !== 'GBP' && (
                          <span className="mt-0.5 block text-right text-[10px] font-bold text-slate-400">
                            {money.format(Math.abs(entry.amountGbp))} books
                          </span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </details>
          </section>
        </>
      )}
    </div>
  )
}
