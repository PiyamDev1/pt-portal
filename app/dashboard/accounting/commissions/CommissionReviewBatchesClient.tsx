'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import {
  ArrowRight,
  BadgePoundSterling,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  RefreshCw,
} from 'lucide-react'
import type {
  CommissionReviewBatchList,
  CommissionReviewBatchState,
  CommissionReviewBatchSummary,
} from '@/lib/accounting/commissionReviews'

const PAGE_SIZE = 25

function stateLabel(state: CommissionReviewBatchState) {
  if (state === 'submitted_to_accounting') return 'Awaiting Accounting'
  if (state === 'approved_locked') return 'Approved and locked'
  if (state === 'returned') return 'Returned'
  if (state === 'draft') return 'Draft'
  return String(state || 'Unknown').replace(/_/g, ' ')
}

function stateClass(state: CommissionReviewBatchState) {
  if (state === 'submitted_to_accounting') return 'bg-amber-50 text-amber-800 ring-amber-200'
  if (state === 'approved_locked') return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
  if (state === 'returned') return 'bg-rose-50 text-rose-800 ring-rose-200'
  return 'bg-slate-100 text-slate-700 ring-slate-200'
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

function formatGbp(value: number) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value)
}

async function responseError(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string }
    return payload.error || 'Unable to load Commission review batches.'
  } catch {
    return 'Unable to load Commission review batches.'
  }
}

function BatchRow({ batch }: { batch: CommissionReviewBatchSummary }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-4">
        <p className="font-bold text-slate-900">
          {formatDate(batch.periodStart)} – {formatDate(batch.periodEnd)}
        </p>
        <p className="mt-1 text-xs text-slate-500">Revision {batch.revision}</p>
      </td>
      <td className="px-4 py-4">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${stateClass(batch.state)}`}
        >
          {stateLabel(batch.state)}
        </span>
        {batch.submittedAt ? (
          <p className="mt-2 text-xs text-slate-500">Submitted {formatDate(batch.submittedAt)}</p>
        ) : null}
      </td>
      <td className="px-4 py-4 text-sm text-slate-700">
        <p>{batch.employeeCount} staff</p>
        <p className="mt-1 text-xs text-slate-500">{batch.entryCount} entries</p>
      </td>
      <td className="px-4 py-4 text-right font-black tabular-nums text-slate-900">
        {formatGbp(batch.totalGbp)}
      </td>
      <td className="px-4 py-4 text-right">
        <Link
          href={`/dashboard/accounting/commissions/${batch.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
        >
          Review <ArrowRight className="h-4 w-4" />
        </Link>
      </td>
    </tr>
  )
}

export default function CommissionReviewBatchesClient() {
  const [report, setReport] = useState<CommissionReviewBatchList | null>(null)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(
          `/api/accounting/commissions/review-batches?limit=${PAGE_SIZE}&offset=${offset}`,
          { cache: 'no-store', signal },
        )
        if (!response.ok) throw new Error(await responseError(response))
        const payload = (await response.json()) as CommissionReviewBatchList
        setReport(payload)
      } catch (loadError) {
        if ((loadError as { name?: string }).name !== 'AbortError') {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load Commission review batches.',
          )
        }
      } finally {
        if (!signal?.aborted) setLoading(false)
      }
    },
    [offset],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const first = report?.items.length ? offset + 1 : 0
  const last = report?.items.length ? offset + report.items.length : 0
  const hasNext = Boolean(report?.hasMore)

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Accounting</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950 sm:text-3xl">Commission review</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Double-check staff Commission statements submitted by Commission Admin before locking
            them for Accounting.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      <section className="grid gap-3 sm:grid-cols-3" aria-label="Commission batch summary">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500">Total batches</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-950">
            {report?.total ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-bold uppercase text-slate-500">On this page</p>
          <p className="mt-2 text-2xl font-black tabular-nums text-slate-950">
            {report?.items.length ?? '—'}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-emerald-800">
            <BadgePoundSterling className="h-5 w-5" />
            <p className="text-xs font-black uppercase">Final Accounting control</p>
          </div>
          <p className="mt-2 text-sm font-semibold text-emerald-900">
            Approved batches are fixed and auditable.
          </p>
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
        >
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-bold">Commission batches could not be loaded</p>
            <p className="mt-1">{error}</p>
          </div>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="font-black text-slate-900">Review batches</h2>
        </div>
        {loading && !report ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading Commission batches…</div>
        ) : report?.items.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Contents</th>
                  <th className="px-4 py-3 text-right">Book total</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {report.items.map((batch) => (
                  <BatchRow key={batch.id} batch={batch} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="font-bold text-slate-800">No Commission review batches</p>
            <p className="mt-1 text-sm text-slate-500">
              Batches appear here after Commission Admin submits a reporting period.
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs text-slate-500">
            {report?.items.length
              ? report.total === null
                ? `${first}–${last}`
                : `${first}–${last} of ${report.total}`
              : 'No batches'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous Commission batches"
              disabled={loading || offset === 0}
              onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Next Commission batches"
              disabled={loading || !hasNext}
              onClick={() => setOffset((current) => current + PAGE_SIZE)}
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
