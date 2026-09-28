'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, CircleCheck } from 'lucide-react'

type CommissionOverviewData = Record<string, unknown>

function formatGbp(value: unknown) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    Number(value || 0),
  )
}

export function CommissionOverview({
  overview,
  onOpenExceptions,
}: {
  overview: CommissionOverviewData
  onOpenExceptions: () => void
}) {
  const held = Number(overview.heldEvents || 0)
  const exceptions = Number(overview.openExceptions || 0)
  const pending = Number(overview.pendingEvents || 0)
  const needsAttention = held > 0 || exceptions > 0
  const cards: Array<[string, string | number]> = [
    ['Pending source events', Number(overview.pendingEvents || 0)],
    ['Processed source events', Number(overview.processedEvents || 0)],
    ['Held source events', Number(overview.heldEvents || 0)],
    ['Open exceptions', Number(overview.openExceptions || 0)],
    ['Active shadow entries', Number(overview.activeShadowEntries || 0)],
    ['Shadow total', formatGbp(overview.shadowTotalGbp)],
    ['Incomplete bonus periods', Number(overview.incompleteBonusPeriods || 0)],
  ]

  return (
    <section className="space-y-4">
      <div
        className={`flex flex-col justify-between gap-4 rounded-xl border p-5 sm:flex-row sm:items-center ${
          needsAttention
            ? 'border-amber-500/35 bg-amber-500/10'
            : 'border-emerald-500/35 bg-emerald-500/10'
        }`}
      >
        <div className="flex items-start gap-3">
          {needsAttention ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          ) : (
            <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
          )}
          <div>
            <p
              className={`font-semibold ${needsAttention ? 'text-amber-100' : 'text-emerald-100'}`}
            >
              {needsAttention
                ? 'Reconciliation needs attention'
                : 'No unresolved calculation issues'}
            </p>
            <p
              className={`mt-1 text-sm ${needsAttention ? 'text-amber-200/75' : 'text-emerald-200/75'}`}
            >
              {needsAttention
                ? `${held} held event${held === 1 ? '' : 's'} and ${exceptions} open exception${exceptions === 1 ? '' : 's'} need review.`
                : pending
                  ? `${pending} source event${pending === 1 ? '' : 's'} can be processed.`
                  : 'Processed preview results have no open exception.'}
            </p>
          </div>
        </div>
        {needsAttention && (
          <button
            type="button"
            onClick={onOpenExceptions}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-amber-400/40 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-400/10"
          >
            Open action queue <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 text-3xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 p-5">
        <p className="font-semibold text-cyan-100">Preview only — never sent to payroll</p>
        <p className="mt-1 text-sm text-cyan-200/75">
          Use this area to process source history, resolve held items, and reconcile a complete
          month. Nothing here creates a payable employee balance.
        </p>
      </div>
    </section>
  )
}

export function CommissionDiagnosticsNotice() {
  return (
    <div className="mb-5 flex flex-col justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
      <div>
        <p className="text-sm font-semibold text-amber-100">
          Engine diagnostics — not normal plan setup
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-200/75">
          Admin Commission is the authoritative place to create, copy and edit an employee-owned
          plan. These screens expose the lower-level policy versions and effective-dated assignments
          produced underneath it. Keep them only for migration checks, support investigations and
          repairing legacy data; using them for everyday setup can create a plan that the employee
          editor cannot explain cleanly.
        </p>
      </div>
      <Link
        href="/dashboard/admin-commission"
        className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-amber-100"
      >
        Open Admin commission <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
