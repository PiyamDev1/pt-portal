import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BadgePoundSterling,
  BookOpenCheck,
  Calculator,
  CheckCircle2,
  CircleHelp,
  Clock3,
  FileClock,
  FileSearch,
  Gauge,
  ListChecks,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  TriangleAlert,
  Users,
} from 'lucide-react'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'
import { getCommissionPageIdentity, requireCommissionManager } from '@/lib/commissions/server'

export const metadata: Metadata = {
  title: 'Shadow Console guide - PT Portal',
  description: 'Detailed operating instructions for the Commission Shadow Console',
}

export const dynamic = 'force-dynamic'

const contents = [
  ['plain-English', 'What the Shadow Console is'],
  ['workflow', 'How a calculation moves through it'],
  ['safety', 'What it can and cannot do'],
  ['daily-workflow', 'Recommended operating workflow'],
  ['metrics', 'Reconcile metrics'],
  ['tabs', 'Every console tab'],
  ['exceptions', 'Action Queue reference'],
  ['services', 'Service-specific behaviour'],
  ['examples', 'Worked examples'],
  ['month-end', 'Month-end checklist'],
  ['troubleshooting', 'Troubleshooting'],
] as const

const metrics = [
  {
    name: 'Pending source events',
    meaning:
      'Real operational changes waiting to be calculated. A plan edit or corrected source record can return previously processed events to Pending.',
    action: 'Use Process now. One click processes up to 100 eligible events.',
  },
  {
    name: 'Processed source events',
    meaning:
      'Events for which the current source version was evaluated successfully. This includes valid zero-commission outcomes.',
    action: 'No action unless the underlying source or plan is later corrected.',
  },
  {
    name: 'Held source events',
    meaning:
      'Calculations stopped safely because a required plan, employee, attribution, value, or authoritative source condition was missing.',
    action: 'Open Action Queue, correct the cause, retry the item, and then process it.',
  },
  {
    name: 'Open exceptions',
    meaning:
      'Audited explanations for held events. An exception is evidence of why no trustworthy result was produced; it is not itself a deduction or payment.',
    action: 'Correct the underlying record. Do not repeatedly retry an unchanged problem.',
  },
  {
    name: 'Active shadow entries',
    meaning:
      'The latest unsuperseded calculation entries. Old revisions remain in the audit history but are not counted as current.',
    action: 'Compare the total and individual rows with the employee plan and source records.',
  },
  {
    name: 'Shadow total',
    meaning:
      'The GBP book value of all active shadow entries. PKR earnings are converted to GBP for company accounting using the applicable monthly rate.',
    action: 'Use this only as a reconciliation total; it is not a payroll payment instruction.',
  },
  {
    name: 'Incomplete bonus periods',
    meaning:
      'Monthly bonus results that cannot be final because one or more contributing source events for that month remain unresolved.',
    action: 'Clear the held events for the month, then run processing again.',
  },
]

const exceptions = [
  {
    code: 'needs_policy',
    title: 'No effective plan matched',
    cause:
      'The recipient has no plan for the service, earning date, role, and branch combination. A plan that starts later does not cover earlier work.',
    fix: 'Create the missing effective-dated plan or correct the intended boundary, then retry and process.',
  },
  {
    code: 'ambiguous_assignment',
    title: 'More than one plan matched',
    cause: 'Overlapping assignment dates or branch scopes make the correct rate uncertain.',
    fix: 'Remove the overlap so exactly one assignment wins for that date and scope.',
  },
  {
    code: 'unsupported_contract_version',
    title: 'Unsupported source format',
    cause:
      'The recorded source event uses a data contract the installed calculation engine cannot interpret.',
    fix: 'Review the installed Commission migration and the source integration before retrying.',
  },
  {
    code: 'missing_required_variable',
    title: 'Required calculation input missing',
    cause: 'A value needed by the selected formula is absent from the source snapshot.',
    fix: 'Complete or correct the ticket, package, or Application source record, then retry.',
  },
  {
    code: 'inactive_recipient',
    title: 'Recipient is inactive',
    cause: 'The employee selected to receive commission is no longer active.',
    fix: 'Correct the attribution or employee status. Never reactivate someone only to suppress the warning.',
  },
  {
    code: 'invalid_source_lineage',
    title: 'Source history cannot be verified',
    cause: 'A correction, refund, archive, or replacement does not form a trustworthy event chain.',
    fix: 'Review the linked operational history and repair the source lineage before retrying.',
  },
  {
    code: 'unresolved_package_scope',
    title: 'Package salesperson unresolved',
    cause: 'The package does not identify the employee responsible for the sale.',
    fix: 'Assign the package sales owner and resynchronise the package source.',
  },
  {
    code: 'package_source_not_authoritative',
    title: 'Package is not financially ready',
    cause:
      'The package is not closed or its passengers, reservations, invoices, payments, currency, or shared transport structure do not reconcile.',
    fix: 'Use the package Commission readiness panel to resolve every listed source issue first.',
  },
  {
    code: 'bonus_period_incomplete',
    title: 'Monthly bonus inputs incomplete',
    cause: 'At least one source event contributing to the employee and month remains held.',
    fix: 'Clear the month’s held events, process them, and allow the bonus period to recalculate.',
  },
  {
    code: 'calculation_failed',
    title: 'Unexpected calculation failure',
    cause:
      'The processor rejected an invalid value or encountered a calculation condition not covered above.',
    fix: 'Read the recorded reason, verify the plan and source values, then escalate if the same failure repeats.',
  },
]

function GuideSection({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7"
    >
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold tracking-tight text-white">{title}</h2>
      <div className="mt-5 text-sm leading-7 text-slate-300">{children}</div>
    </section>
  )
}

function Step({
  number,
  title,
  children,
}: {
  number: number
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-400 font-black text-slate-950">
        {number}
      </span>
      <div className="pt-0.5">
        <p className="font-bold text-white">{title}</p>
        <div className="mt-1 text-slate-400">{children}</div>
      </div>
    </li>
  )
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: 'cyan' | 'amber' | 'emerald'
  title: string
  children: React.ReactNode
}) {
  const styles = {
    cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  }
  const Icon = tone === 'amber' ? TriangleAlert : tone === 'emerald' ? CheckCircle2 : CircleHelp
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${styles[tone]}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-bold">{title}</p>
        <div className="mt-1 text-sm leading-6 opacity-80">{children}</div>
      </div>
    </div>
  )
}

export default async function ShadowConsoleGuidePage() {
  const access = await requireCommissionManager()
  if (!access.authorized) {
    redirect(access.response.status === 401 ? '/login' : '/dashboard')
  }
  const identity = await getCommissionPageIdentity(access)

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-950 text-white">
        <PageHeader
          employeeName={identity.fullName}
          role={identity.role}
          location={identity.location}
          userId={identity.userId}
          showBack
        />
        <main className="mx-auto max-w-[1450px] px-4 pb-20 pt-24 sm:px-6 lg:pt-8">
          <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/15 via-slate-900 to-slate-900 p-6 sm:p-8">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">
                  <BookOpenCheck className="h-4 w-4" /> Detailed operating manual
                </div>
                <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  Commission Shadow Console guide
                </h1>
                <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300">
                  The Shadow Console proves that operational records and employee plans produce the
                  expected commission before any payroll process is allowed to rely on them. It is a
                  reconciliation and diagnostic workspace for Admin and HR—not a second place to
                  manage ordinary employee plans.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/dashboard/admin-commission"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:border-slate-500"
                >
                  <ArrowLeft className="h-4 w-4" /> Admin commission
                </Link>
                <Link
                  href="/dashboard/admin-commission/engine"
                  className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300"
                >
                  Open Shadow Console <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="self-start rounded-2xl border border-slate-800 bg-slate-900 p-5 xl:sticky xl:top-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                On this page
              </p>
              <nav className="mt-4 space-y-1" aria-label="Shadow Console guide contents">
                {contents.map(([id, label], index) => (
                  <a
                    key={id}
                    href={`#${id}`}
                    className="flex gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <span className="font-mono text-cyan-400">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span>{label}</span>
                  </a>
                ))}
              </nav>
            </aside>

            <div className="space-y-6">
              <GuideSection
                id="plain-English"
                eyebrow="Start here"
                title="What the Shadow Console is"
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <Callout tone="cyan" title="Real inputs, preview outputs">
                    It reads real Ticketing, Package, and Application history and applies real
                    effective-dated staff plans. The resulting ledger entries are marked shadow and
                    non-payable.
                  </Callout>
                  <Callout tone="emerald" title="A safety stage before payroll">
                    It lets you find missing plans, wrong ownership, incomplete package data, and
                    calculation differences while the results still cannot create a payable balance.
                  </Callout>
                </div>
                <p className="mt-5">
                  “Shadow” does not mean sample data or a disposable test. It means the calculation
                  runs beside the operational system using real records, while remaining separated
                  from payroll. Employees may see their own result in{' '}
                  <strong>My commissions</strong>, but it is still labelled as a preview.
                </p>
                <p className="mt-3">
                  The console is needed because a saved rate alone does not prove that the correct
                  employee, service, date, branch, passenger count, profit value, currency, or
                  correction history will be used. The console shows the end-to-end result and stops
                  uncertain cases instead of silently estimating them.
                </p>
              </GuideSection>

              <GuideSection
                id="workflow"
                eyebrow="Calculation lifecycle"
                title="How a calculation moves through the console"
              >
                <div className="grid gap-3 lg:grid-cols-5">
                  {[
                    [
                      FileSearch,
                      '1. Source change',
                      'A ticket, package, or Application is completed, corrected, refunded, archived, reassigned, or deleted.',
                    ],
                    [
                      Clock3,
                      '2. Pending event',
                      'An immutable snapshot is queued with its earning date, ownership, branch, and calculation variables.',
                    ],
                    [
                      Route,
                      '3. Plan resolution',
                      'The engine finds the one plan effective for the recipient, service, role, date, and location.',
                    ],
                    [
                      Calculator,
                      '4. Shadow result',
                      'A non-payable entry is calculated, or the event is held with a specific exception.',
                    ],
                    [
                      RefreshCw,
                      '5. Reconciliation',
                      'Corrections create a new source version and superseding result, retaining the audit trail.',
                    ],
                  ].map(([Icon, title, copy]) => {
                    const StepIcon = Icon as typeof FileSearch
                    return (
                      <div
                        key={String(title)}
                        className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                      >
                        <StepIcon className="h-5 w-5 text-cyan-300" />
                        <p className="mt-3 font-bold text-white">{String(title)}</p>
                        <p className="mt-2 text-xs leading-5 text-slate-400">{String(copy)}</p>
                      </div>
                    )
                  })}
                </div>
                <Callout tone="amber" title="The earning date controls the plan">
                  A plan beginning on 1 February does not cover work earned in January. “Edit
                  commission” overwrites the selected plan; “New commission” creates the next
                  effective-dated plan and preserves the preceding period.
                </Callout>
              </GuideSection>

              <GuideSection
                id="safety"
                eyebrow="Control boundary"
                title="What it can and cannot do"
              >
                <div className="overflow-hidden rounded-xl border border-slate-800">
                  <div className="grid bg-slate-950/70 sm:grid-cols-2">
                    <div className="border-b border-slate-800 p-5 sm:border-b-0 sm:border-r">
                      <p className="flex items-center gap-2 font-bold text-emerald-200">
                        <CheckCircle2 className="h-4 w-4" /> It can
                      </p>
                      <ul className="mt-3 space-y-2 text-slate-400">
                        <li>• Process queued operational events in bounded batches.</li>
                        <li>• Calculate preview commission and monthly bonuses.</li>
                        <li>• Show recipient separately from work or profit owner.</li>
                        <li>• Hold unsafe calculations and explain the reason.</li>
                        <li>• Recalculate after a source record or plan changes.</li>
                        <li>• Retain corrections, reversals, and previous revisions for audit.</li>
                      </ul>
                    </div>
                    <div className="p-5">
                      <p className="flex items-center gap-2 font-bold text-amber-200">
                        <AlertTriangle className="h-4 w-4" /> It cannot
                      </p>
                      <ul className="mt-3 space-y-2 text-slate-400">
                        <li>• Pay an employee or create a payroll transaction.</li>
                        <li>• Repair the underlying ticket, package, or Application for you.</li>
                        <li>• Guess a rate when no effective plan exists.</li>
                        <li>• Ignore a missing or ambiguous owner.</li>
                        <li>• Turn an unresolved package into an authoritative sale.</li>
                        <li>• Make a repeated retry succeed when the cause is unchanged.</li>
                      </ul>
                    </div>
                  </div>
                </div>
                <p className="mt-4">
                  Access is restricted to Admin, HR, or staff explicitly granted Commission-policy
                  management access. Ordinary staff use <strong>My commissions</strong> and cannot
                  inspect company-wide financial controls.
                </p>
              </GuideSection>

              <GuideSection
                id="daily-workflow"
                eyebrow="Operating procedure"
                title="Recommended workflow"
              >
                <ol className="space-y-5">
                  <Step number={1} title="Manage the employee plan in Admin commission">
                    Use the employee-owned plan editor for normal work. Confirm service rates,
                    currency, assistance scope, Application routing, branch scope, and effective
                    date. Use New commission for a future change, Edit commission to correct the
                    current plan, or Edit previous policy in plan history to correct a closed
                    period. A previous-policy correction keeps both historical date boundaries
                    locked and leaves the following plan untouched.
                  </Step>
                  <Step number={2} title="Complete the operational source record">
                    Ticketing events need valid attribution and financial variables. Packages need
                    to pass Commission readiness and be closed. Applications must reach their
                    qualifying completion status and retain the completing employee.
                  </Step>
                  <Step number={3} title="Open Reconcile before pressing Process now">
                    Note the Pending, Held, and Open exception counts. A large Pending count after a
                    migration or plan change is normal because affected history is queued again.
                  </Step>
                  <Step number={4} title="Press Process now until Pending is cleared">
                    Each click claims up to 100 eligible events, oldest earning date first. Another
                    worker cannot claim the same event simultaneously. Refresh between runs to see
                    the latest totals.
                  </Step>
                  <Step number={5} title="Correct Action Queue causes before retrying">
                    Open an item, identify its service and employee, and fix the plan or source
                    record. Retry calculation only queues that event; press Process now afterwards
                    to perform the calculation.
                  </Step>
                  <Step number={6} title="Inspect Calculated results">
                    Confirm the recipient, work/profit owner, service, earning date, amount, and
                    revision. For redirected Applications these two employees are intentionally
                    different.
                  </Step>
                  <Step number={7} title="Reconcile monthly bonuses and staff previews">
                    Incomplete bonus periods must be resolved before month-end. Compare the engine’s
                    GBP book value with the employee’s pay-currency view in My commissions.
                  </Step>
                  <Step number={8} title="Record unresolved anomalies instead of forcing them">
                    If a source lineage or value is genuinely uncertain, leave the event held and
                    escalate it with the source record reference. A held item is safer than an
                    unsupported payment.
                  </Step>
                </ol>
              </GuideSection>

              <GuideSection id="metrics" eyebrow="Reconcile tab" title="What every metric means">
                <div className="overflow-x-auto rounded-xl border border-slate-800">
                  <table className="w-full min-w-[820px] text-left text-sm">
                    <thead className="bg-slate-950/70 text-slate-400">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Metric</th>
                        <th className="px-4 py-3 font-semibold">Meaning</th>
                        <th className="px-4 py-3 font-semibold">What to do</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {metrics.map((metric) => (
                        <tr key={metric.name} className="align-top">
                          <td className="px-4 py-4 font-bold text-white">{metric.name}</td>
                          <td className="px-4 py-4 text-slate-400">{metric.meaning}</td>
                          <td className="px-4 py-4 text-slate-300">{metric.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </GuideSection>

              <GuideSection
                id="tabs"
                eyebrow="Screen reference"
                title="What every console tab is for"
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  {[
                    [
                      Gauge,
                      'Reconcile',
                      'System-wide health and workload. Start and finish here. A green status means there are no held events or open exceptions; Pending can still require processing.',
                    ],
                    [
                      FileClock,
                      'Calculated results',
                      'The latest 50 ledger revisions loaded by the console. Recipient is who earns; work/profit owner is who performed or owned the source activity. Amount is shown as GBP book value.',
                    ],
                    [
                      AlertTriangle,
                      'Action Queue',
                      'The latest 50 open exceptions. Fix the underlying issue, select Retry calculation, then run Process now. Retry alone does not calculate.',
                    ],
                    [
                      BadgePoundSterling,
                      'Monthly bonus',
                      'Employee/month results showing gross contributed profit, ordinary commission cost, qualifying profit, target, reward, and incomplete-input count.',
                    ],
                    [
                      Calculator,
                      'Formula preview',
                      'A synthetic calculator for testing a ticket sales-bonus formula. It does not read a customer record or create a Commission entry, although use of the preview is audited.',
                    ],
                    [
                      ShieldCheck,
                      'Policy lab',
                      'A low-level diagnostic editor for raw policy identities and immutable versions. Ordinary employee plans should be created in Admin commission instead.',
                    ],
                    [
                      Users,
                      'Manual assignments',
                      'A low-level way to bind an active policy version to an employee, service, role, branch, and date range. Avoid it for ordinary staff plans because Admin commission creates these bindings automatically.',
                    ],
                  ].map(([Icon, title, copy]) => {
                    const TabIcon = Icon as typeof Gauge
                    return (
                      <article
                        key={String(title)}
                        className="rounded-xl border border-slate-800 bg-slate-950/55 p-5"
                      >
                        <div className="flex items-center gap-3">
                          <span className="rounded-lg bg-cyan-500/10 p-2 text-cyan-300">
                            <TabIcon className="h-4 w-4" />
                          </span>
                          <h3 className="font-bold text-white">{String(title)}</h3>
                        </div>
                        <p className="mt-3 text-slate-400">{String(copy)}</p>
                      </article>
                    )
                  })}
                </div>
                <Callout tone="amber" title="Policy lab and Manual assignments are advanced tools">
                  They expose engine primitives and can create structures that are harder to explain
                  from an employee’s plan. Use Admin commission unless you are diagnosing a legacy
                  or deliberately low-level policy setup.
                </Callout>
              </GuideSection>

              <GuideSection
                id="exceptions"
                eyebrow="Action Queue"
                title="Exception codes and the correct response"
              >
                <div className="space-y-3">
                  {exceptions.map((item) => (
                    <details
                      key={item.code}
                      className="group rounded-xl border border-slate-800 bg-slate-950/55 open:border-amber-500/30"
                    >
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4">
                        <span>
                          <span className="font-mono text-xs text-amber-300">{item.code}</span>
                          <span className="ml-3 font-bold text-white">{item.title}</span>
                        </span>
                        <span className="text-slate-500 transition group-open:rotate-90">›</span>
                      </summary>
                      <div className="border-t border-slate-800 px-4 py-4">
                        <p>
                          <strong className="text-slate-200">Why it appears:</strong> {item.cause}
                        </p>
                        <p className="mt-2">
                          <strong className="text-slate-200">Correct response:</strong> {item.fix}
                        </p>
                      </div>
                    </details>
                  ))}
                </div>
                <Callout tone="amber" title="Never use Retry as a dismiss button">
                  Retry increments the audited retry count and queues the same source event. If the
                  date, plan, branch, owner, or source value is unchanged, it should fail for the
                  same reason again.
                </Callout>
              </GuideSection>

              <GuideSection
                id="services"
                eyebrow="Source rules"
                title="How each operational module reaches Commission"
              >
                <div className="space-y-4">
                  <article className="rounded-xl border border-slate-800 bg-slate-950/55 p-5">
                    <h3 className="font-bold text-white">Ticketing</h3>
                    <p className="mt-2 text-slate-400">
                      Ticket sales, assistance, date changes, reissues, Low Fare findings, and
                      supplier fare adjustments generate versioned events from the ticketing ledger.
                      Assistance may pay different amounts according to the primary agent. Archived
                      or deleted ledger work is superseded so it no longer contributes an active
                      earning. Marginal monthly tiers recalculate when qualifying volume changes.
                    </p>
                  </article>
                  <article className="rounded-xl border border-slate-800 bg-slate-950/55 p-5">
                    <h3 className="font-bold text-white">Packages</h3>
                    <p className="mt-2 text-slate-400">
                      Commission is emitted only from an authoritative closed package. Passenger,
                      reservation, invoice, refund, supplier commission, payment, and currency
                      checks must reconcile. A linked family group converted to one customer package
                      is one commission case. Passenger-count bands therefore pay once for the
                      combined package—for example £100 for 1–3 passengers or £150 for 4+—while the
                      separate per-passenger method still multiplies by the passenger count.
                    </p>
                  </article>
                  <article className="rounded-xl border border-slate-800 bg-slate-950/55 p-5">
                    <h3 className="font-bold text-white">Applications</h3>
                    <p className="mt-2 text-slate-400">
                      NADRA, Pakistani passport, British passport, and Visa work qualifies at its
                      configured completion status. Urgent or executive NADRA and Pakistani passport
                      work uses its separate urgent rate. The completing employee remains the work
                      owner. A profile may pay that employee, redirect commission to another active
                      employee at the recipient’s own effective rate and currency, or create no
                      Application earning.
                    </p>
                  </article>
                  <article className="rounded-xl border border-slate-800 bg-slate-950/55 p-5">
                    <h3 className="font-bold text-white">GBP and PKR</h3>
                    <p className="mt-2 text-slate-400">
                      Staff earning in PKR retain their PKR salary and commission values. The
                      monthly exchange rate supplies a GBP book value for company reconciliation.
                      The Shadow Console’s result table shows GBP; My commissions shows the
                      employee-facing pay currency and the applicable conversion state.
                    </p>
                  </article>
                </div>
              </GuideSection>

              <GuideSection
                id="examples"
                eyebrow="Worked scenarios"
                title="How to interpret common cases"
              >
                <div className="space-y-5">
                  <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-5">
                    <p className="font-bold text-white">Redirected Application commission</p>
                    <p className="mt-2 text-slate-400">
                      Agent A completes an urgent NADRA Application. Agent A’s plan redirects
                      Application commission to Agent B. The result shows Agent B as Recipient and
                      Agent A as Work / profit owner. Agent B’s urgent NADRA rate and currency are
                      used. If Agent B has no plan covering that earning date, the event is held
                      with needs_policy.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-5">
                    <p className="font-bold text-white">A new plan starts next month</p>
                    <p className="mt-2 text-slate-400">
                      The old plan starts 1 January and the new plan starts 1 February. Work earned
                      on 31 January uses the old plan; work earned on 1 February uses the new plan.
                      Create this using New commission. Editing the January plan would overwrite it
                      instead of creating the intended boundary.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-5">
                    <p className="font-bold text-white">
                      Linked group package with five passengers
                    </p>
                    <p className="mt-2 text-slate-400">
                      Several linked family quotations are converted into one group customer package
                      containing five passengers. A passenger-band plan pays one £150 package
                      commission. It does not pay £150 per family and does not multiply £150 by
                      five.
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-5">
                    <p className="font-bold text-white">A deleted Ticketing ledger record</p>
                    <p className="mt-2 text-slate-400">
                      The deletion or archive creates a new source version. Processing writes a
                      correction that supersedes the previous active earning. The old row remains as
                      audit evidence, but Active shadow entries and the Shadow total use only the
                      latest unsuperseded result.
                    </p>
                  </div>
                </div>
              </GuideSection>

              <GuideSection
                id="month-end"
                eyebrow="Control checklist"
                title="Before relying on a completed month"
              >
                <ul className="grid gap-3 sm:grid-cols-2">
                  {[
                    'Pending source events are zero after the final processing run.',
                    'Held source events and open exceptions are zero, or every remaining item has a documented reason not to pay.',
                    'Every employee has one unambiguous plan for each earned service, date, role, and branch.',
                    'Application redirects show the intended recipient and the completing employee separately.',
                    'Package readiness is complete for every closed package included in the month.',
                    'Deleted, archived, refunded, and corrected work no longer contributes an active amount.',
                    'Incomplete bonus periods are zero before treating bonus outcomes as final.',
                    'PKR months have the agreed conversion rate and the GBP book totals reconcile to remittance records.',
                    'Calculated result spot checks agree with source passenger counts, profit, rates, and effective dates.',
                    'My commissions matches the employee-facing result expected from the reconciled engine.',
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950/55 p-4"
                    >
                      <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      <span className="text-slate-400">{item}</span>
                    </li>
                  ))}
                </ul>
                <Callout tone="cyan" title="Shadow mode is still not payroll approval">
                  A clean month means the preview is reconciled and suitable for review. Moving from
                  shadow calculation to an authorised payable workflow requires a separate,
                  deliberate control decision.
                </Callout>
              </GuideSection>

              <GuideSection
                id="troubleshooting"
                eyebrow="Quick answers"
                title="Troubleshooting and common misunderstandings"
              >
                <div className="space-y-4">
                  {[
                    [
                      'I changed a plan but the warning is still visible.',
                      'The profile change queues affected events; it does not immediately calculate every event. Press Process now until Pending is cleared, then Refresh. Also confirm the new plan covers the event’s earning date.',
                    ],
                    [
                      'I pressed Retry and nothing changed.',
                      'Retry only moves that event back to Pending. Correct the cause first, then press Process now.',
                    ],
                    [
                      'Pending is not zero after one run.',
                      'The button processes a maximum of 100 events. Run it again until the queue is clear.',
                    ],
                    [
                      'Why are recipient and work owner different?',
                      'Ticket assistance and Application routing can pay someone other than the primary or completing employee. This separation is intentional and auditable.',
                    ],
                    [
                      'Why is a PKR employee shown in GBP?',
                      'The console is a company reconciliation view and displays GBP book value. The employee-facing sheet retains pay currency.',
                    ],
                    [
                      'Why does redirected Application work need an exchange rate?',
                      'The recipient’s plan controls the commission rate and pay currency. If work is redirected to a PKR employee, enter that earning month’s PKR-to-GBP book rate before processing can complete.',
                    ],
                    [
                      'Why can I still see an old corrected row?',
                      'History is retained. The revision and superseding relationship identify which result is active; old evidence is not silently deleted.',
                    ],
                    [
                      'Why does a zero-rate service have a processed result?',
                      'An explicit zero is a valid policy decision. It proves the engine found the plan and intentionally calculated no earning.',
                    ],
                    [
                      'Should I use Policy lab to fix needs_policy?',
                      'Usually no. Create or correct the employee plan in Admin commission. Policy lab is for advanced engine diagnostics.',
                    ],
                  ].map(([question, answer]) => (
                    <div
                      key={question}
                      className="rounded-xl border border-slate-800 bg-slate-950/55 p-5"
                    >
                      <p className="font-bold text-white">{question}</p>
                      <p className="mt-2 text-slate-400">{answer}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex flex-col justify-between gap-4 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-5 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-bold text-cyan-100">Ready to reconcile?</p>
                    <p className="mt-1 text-sm text-cyan-200/75">
                      Start on Reconcile, process Pending events, then work through Action Queue.
                    </p>
                  </div>
                  <Link
                    href="/dashboard/admin-commission/engine"
                    className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300"
                  >
                    Open Shadow Console <Play className="h-4 w-4" />
                  </Link>
                </div>
              </GuideSection>
            </div>
          </div>
        </main>
      </div>
    </DashboardClientWrapper>
  )
}
