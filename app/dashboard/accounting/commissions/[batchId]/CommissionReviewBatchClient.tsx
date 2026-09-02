'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
} from 'lucide-react'
import type {
  CommissionReviewBatchDetail,
  CommissionReviewBatchState,
} from '@/lib/accounting/commissionReviews'

function stateLabel(state: CommissionReviewBatchState) {
  if (state === 'submitted_to_accounting') return 'Awaiting Accounting'
  if (state === 'approved_locked') return 'Approved and locked'
  if (state === 'returned') return 'Returned to Commission Admin'
  if (state === 'draft') return 'Draft'
  return String(state || 'Unknown').replace(/_/g, ' ')
}

function formatDate(value: string | null) {
  if (!value) return 'Not recorded'
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00Z` : value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

async function responseError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as { error?: string }
    return payload.error || fallback
  } catch {
    return fallback
  }
}

export default function CommissionReviewBatchClient({ batchId }: { batchId: string }) {
  const [detail, setDetail] = useState<CommissionReviewBatchDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [action, setAction] = useState<'return' | 'approve' | null>(null)
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/accounting/commissions/review-batches/${batchId}`, {
          cache: 'no-store',
          signal,
        })
        if (!response.ok) {
          throw new Error(await responseError(response, 'Unable to load this Commission batch.'))
        }
        setDetail((await response.json()) as CommissionReviewBatchDetail)
      } catch (loadError) {
        if ((loadError as { name?: string }).name !== 'AbortError') {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load this Commission batch.',
          )
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [batchId],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const closeAction = () => {
    setAction(null)
    setReason('')
    setConfirmed(false)
  }

  const mutate = async (kind: 'return' | 'approve') => {
    if (
      !detail ||
      (kind === 'return' && reason.trim().length < 3) ||
      (kind === 'approve' && !confirmed)
    ) {
      return
    }

    setSubmitting(true)
    setError(null)
    setMessage(null)
    try {
      const response = await fetch(
        `/api/accounting/commissions/review-batches/${batchId}/${kind}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedRevision: detail.batch.revision,
            ...(kind === 'return' ? { reason: reason.trim() } : {}),
          }),
        },
      )
      if (!response.ok) {
        throw new Error(
          await responseError(
            response,
            kind === 'return'
              ? 'Unable to return this Commission batch.'
              : 'Unable to approve this Commission batch.',
          ),
        )
      }

      closeAction()
      setMessage(
        kind === 'return'
          ? 'The batch was returned to Commission Admin.'
          : 'The batch was approved and permanently locked.',
      )
      await load()
    } catch (mutationError) {
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : 'Unable to update this Commission batch.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !detail) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading Commission batch…</div>
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/accounting/commissions"
          className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Commission review
        </Link>
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800"
        >
          {error || 'This Commission batch could not be found.'}
        </div>
      </div>
    )
  }

  const { batch } = detail
  const actionable = batch.state === 'submitted_to_accounting'

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/dashboard/accounting/commissions"
          className="inline-flex items-center gap-2 text-sm font-bold text-emerald-800 hover:text-emerald-950"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Commission review
        </Link>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
              Accounting
            </p>
            <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">
              {formatDate(batch.periodStart)} – {formatDate(batch.periodEnd)}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Commission batch revision {batch.revision}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start">
            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-sm font-black text-slate-800 ring-1 ring-inset ring-slate-200">
              {stateLabel(batch.state)}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </header>

      {actionable && batch.isStale ? (
        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">Commission results changed after submission</p>
            <p className="mt-1">
              Final approval is blocked. Return this batch so Commission Admin can prepare a new
              immutable revision from the corrected results.
            </p>
          </div>
        </div>
      ) : actionable ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">Double-check before final approval</p>
            <p className="mt-1">
              Confirm every staff breakdown and deduction. Approval fixes this statement; later
              corrections must be carried into the next open reporting period.
            </p>
          </div>
        </div>
      ) : batch.state === 'approved_locked' ? (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">Approved and locked</p>
            <p className="mt-1">
              Approved {formatDate(batch.approvedAt)}
              {batch.approvedByName ? ` by ${batch.approvedByName}` : ''}. This statement cannot be
              edited.
            </p>
          </div>
        </div>
      ) : null}

      {message ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"
        >
          {message}
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Batch totals">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500">Staff</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-950">
            {batch.employeeCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500">Entries</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-950">{batch.entryCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500">GBP book total</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-950">
            {formatMoney(batch.totalGbp, 'GBP')}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500">Submitted by</p>
          <p className="mt-2 font-black text-slate-950">
            {batch.submittedByName || 'Not recorded'}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(batch.submittedAt)}</p>
        </div>
      </section>

      {batch.totalsByCurrency.length ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-black text-slate-900">Native currency totals</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {batch.totalsByCurrency.map((total) => (
              <span
                key={total.currency}
                className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-black tabular-nums text-slate-800"
              >
                {formatMoney(total.amount, total.currency)}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {detail.warnings.length ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <h2 className="font-black">Items requiring attention</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {detail.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-black text-slate-900">Staff breakdown</h2>
          <p className="mt-1 text-xs text-slate-500">
            Native amounts remain separate by currency; GBP is the Accounting book value.
          </p>
        </div>
        {detail.staff.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Staff</th>
                  <th className="px-3 py-3 text-right">Salary</th>
                  <th className="px-3 py-3 text-right">Ticketing</th>
                  <th className="px-3 py-3 text-right">Applications</th>
                  <th className="px-3 py-3 text-right">Packages</th>
                  <th className="px-3 py-3 text-right">Bonus</th>
                  <th className="px-3 py-3 text-right">Penalties</th>
                  <th className="px-3 py-3 text-right">Refunds</th>
                  <th className="px-3 py-3 text-right">Net</th>
                  <th className="px-3 py-3 text-right">GBP book</th>
                </tr>
              </thead>
              <tbody>
                {detail.staff.map((line, index) => (
                  <tr
                    key={`${line.employeeId || line.employeeName}-${line.currency}-${index}`}
                    className="border-t border-slate-100 text-sm"
                  >
                    <td className="px-3 py-3">
                      <p className="font-bold text-slate-900">{line.employeeName}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{line.currency}</p>
                    </td>
                    {[
                      line.salary,
                      line.ticketing,
                      line.applications,
                      line.packages,
                      line.bonus,
                      line.penalties,
                      line.refunds,
                      line.netAmount,
                    ].map((amount, amountIndex) => (
                      <td
                        key={amountIndex}
                        className="px-3 py-3 text-right tabular-nums text-slate-700"
                      >
                        {formatMoney(amount, line.currency)}
                      </td>
                    ))}
                    <td className="px-3 py-3 text-right font-black tabular-nums text-slate-950">
                      {formatMoney(line.totalGbp, 'GBP')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            No staff statements were included in this batch.
          </div>
        )}
      </section>

      {detail.entries.length ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-black text-slate-900">Included Commission entries</h2>
            <p className="mt-1 text-xs text-slate-500">
              Immutable entry membership used to produce the staff statement totals.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[850px] w-full">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-3">Staff</th>
                  <th className="px-3 py-3">Source</th>
                  <th className="px-3 py-3">Service</th>
                  <th className="px-3 py-3">Evidence</th>
                  <th className="px-3 py-3">Earned</th>
                  <th className="px-3 py-3 text-right">Native amount</th>
                  <th className="px-3 py-3 text-right">GBP book</th>
                </tr>
              </thead>
              <tbody>
                {detail.entries.map((entry, index) => (
                  <tr key={entry.id || index} className="border-t border-slate-100 text-sm">
                    <td className="px-3 py-3 font-bold text-slate-900">{entry.employeeName}</td>
                    <td className="px-3 py-3 text-slate-700">
                      {entry.sourceModule.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      <p>{entry.serviceCode.replace(/_/g, ' ')}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {entry.entryKind.replace(/_/g, ' ')}
                      </p>
                    </td>
                    <td className="max-w-xs px-3 py-3 text-slate-700">
                      <p>{entry.detail || 'No note'}</p>
                      {entry.reference ? (
                        <p className="mt-0.5 break-all font-mono text-xs text-slate-500">
                          {entry.reference}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3 text-slate-700">{formatDate(entry.earningOn)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-800">
                      {formatMoney(entry.amount, entry.currency)}
                    </td>
                    <td className="px-3 py-3 text-right font-black tabular-nums text-slate-950">
                      {formatMoney(entry.amountGbp, 'GBP')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {detail.events.length || batch.contentHash ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="font-black text-slate-900">Audit evidence</h2>
          {batch.contentHash ? (
            <div className="mt-3 rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-bold uppercase text-slate-500">Batch content hash</p>
              <code className="mt-1 block break-all text-xs text-slate-700">
                {batch.contentHash}
              </code>
            </div>
          ) : null}
          {detail.events.length ? (
            <ol className="mt-3 space-y-2">
              {detail.events.map((event, index) => (
                <li
                  key={event.id || index}
                  className="rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-bold text-slate-900">{event.action.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {event.actorName || 'System'}
                    {event.reason ? ` — ${event.reason}` : ''}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}

      {batch.returnReason ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
          <h2 className="font-black">Return reason</h2>
          <p className="mt-1 whitespace-pre-wrap">{batch.returnReason}</p>
        </section>
      ) : null}

      {actionable ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black text-slate-900">Accounting decision</h2>
              <p className="mt-1 text-sm text-slate-500">
                Return discrepancies for correction or approve the checked statement.
              </p>
              {!batch.canApprove ? (
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  {batch.isStale
                    ? 'Final approval is blocked because the current Commission results no longer match this batch.'
                    : 'Final approval must be completed by someone other than the employee who sent the batch to Accounting.'}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {batch.canReturn ? (
                <button
                  type="button"
                  onClick={() => setAction('return')}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-black text-rose-700 hover:bg-rose-50"
                >
                  <RotateCcw className="h-4 w-4" /> Return for correction
                </button>
              ) : null}
              {batch.canApprove ? (
                <button
                  type="button"
                  onClick={() => setAction('approve')}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white hover:bg-emerald-800"
                >
                  <CheckCircle2 className="h-4 w-4" /> Review final approval
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {action === 'return' ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="return-batch-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h2 id="return-batch-title" className="text-lg font-black text-slate-950">
              Return batch for correction
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Explain exactly what Commission Admin must check. The reason is retained in the audit
              trail.
            </p>
            <label
              htmlFor="commission-return-reason"
              className="mt-4 block text-sm font-bold text-slate-800"
            >
              Return reason
            </label>
            <textarea
              id="commission-return-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              rows={5}
              autoFocus
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAction}
                disabled={submitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void mutate('return')}
                disabled={submitting || reason.trim().length < 3}
                className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Returning…' : 'Return batch'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {action === 'approve' ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="approve-batch-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-2 text-emerald-800">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h2 id="approve-batch-title" className="text-lg font-black text-slate-950">
                Approve and lock Commission batch?
              </h2>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              This is the final Accounting approval. The batch and its staff statements will be
              fixed; later corrections must be posted to the next open period.
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700"
              />
              <span>
                I have double-checked the staff breakdown, deductions, currencies and totals.
              </span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeAction}
                disabled={submitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void mutate('approve')}
                disabled={submitting || !confirmed}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Approving…' : 'Approve and lock'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-lg">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Refreshing
        </div>
      ) : null}
    </div>
  )
}
