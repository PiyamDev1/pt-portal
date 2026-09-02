'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CircleCheck,
  FileCheck2,
  LoaderCircle,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react'

type JsonRecord = Record<string, unknown>

export type CommissionStaffOption = {
  id: string
  name: string
}

type StaffReportItem = {
  employeeId: string
  employeeName: string
  sourceModule: string
  serviceCode: string
  entryKind: string
  payCurrency: string
  entryCount: number
  amountPayCurrency: number
  amountGbp: number
}

type CurrencyTotal = {
  employeeId: string
  employeeName: string
  payCurrency: string
  amountPayCurrency: number
  amountGbp: number
}

type StaffReport = {
  periodStart: string
  periodEnd: string
  companyTotalGbp: number
  companyAdmImpactGbp: number
  items: StaffReportItem[]
  currencyTotals: CurrencyTotal[]
  readiness: {
    pendingEvents: number
    openExceptions: number
    incompleteBonusPeriods: number
  }
  reviewBatch: PreparedBatch | null
}

type PreparedBatch = {
  id: string
  revision: number
  status: string
  contentHash: string
  entryCount: number
  isStale: boolean
}

const inputClass =
  'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400'
const primaryButtonClass =
  'inline-flex items-center justify-center rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50'

function object(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function rows(value: unknown) {
  return Array.isArray(value) ? value : []
}

function number(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function londonMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const part = (type: 'year' | 'month') => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}`
}

function monthLabel(period: string) {
  const date = new Date(`${period}-01T12:00:00Z`)
  return Number.isNaN(date.getTime())
    ? period
    : new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(date)
}

function formatMoney(value: number, currency = 'GBP') {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: /^[A-Z]{3}$/.test(currency) ? currency : 'GBP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function requestKey(prefix: string) {
  return `${prefix}:${crypto.randomUUID()}`
}

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: 'no-store' })
  const body = (await response.json().catch(() => ({}))) as JsonRecord
  if (!response.ok) throw new Error(text(body.error, 'Commission request failed.'))
  return body
}

function normalizeReport(value: unknown): StaffReport {
  const report = object(value)
  const readiness = object(report.readiness)
  const reviewBatchValue = object(report.reviewBatch)
  const reviewBatchId = text(reviewBatchValue.id)
  return {
    periodStart: text(report.periodStart),
    periodEnd: text(report.periodEnd),
    companyTotalGbp: number(report.companyTotalGbp),
    companyAdmImpactGbp: number(report.companyAdmImpactGbp),
    items: rows(report.items).map((value) => {
      const item = object(value)
      return {
        employeeId: text(item.employeeId),
        employeeName: text(item.employeeName, 'Unknown employee'),
        sourceModule: text(item.sourceModule, 'other').toLowerCase(),
        serviceCode: text(item.serviceCode, 'other'),
        entryKind: text(item.entryKind, 'ordinary'),
        payCurrency: text(item.payCurrency, 'GBP').toUpperCase(),
        entryCount: number(item.entryCount),
        amountPayCurrency: number(item.amountPayCurrency),
        amountGbp: number(item.amountGbp),
      }
    }),
    currencyTotals: rows(report.currencyTotals).map((value) => {
      const total = object(value)
      return {
        employeeId: text(total.employeeId),
        employeeName: text(total.employeeName, 'Unknown employee'),
        payCurrency: text(total.payCurrency, 'GBP').toUpperCase(),
        amountPayCurrency: number(total.amountPayCurrency),
        amountGbp: number(total.amountGbp),
      }
    }),
    readiness: {
      pendingEvents: number(readiness.pendingEvents),
      openExceptions: number(readiness.openExceptions),
      incompleteBonusPeriods: number(readiness.incompleteBonusPeriods),
    },
    reviewBatch: reviewBatchId
      ? {
          id: reviewBatchId,
          revision: number(reviewBatchValue.revision),
          status: text(reviewBatchValue.state, 'unknown'),
          contentHash: text(reviewBatchValue.contentHash),
          entryCount: number(reviewBatchValue.entryCount),
          isStale: reviewBatchValue.isStale === true,
        }
      : null,
  }
}

function sourceGroup(item: StaffReportItem) {
  const entryKind = item.entryKind.toLowerCase()
  const serviceCode = item.serviceCode.toLowerCase()

  if (entryKind === 'refund_reversal' || serviceCode.includes('refund')) {
    return 'Refunds'
  }
  if (
    item.sourceModule === 'bonus' ||
    entryKind === 'sales_bonus' ||
    serviceCode === 'sales_bonus'
  ) {
    return 'Bonus'
  }
  if (item.sourceModule === 'applications') return 'Applications'
  if (item.sourceModule === 'packages') return 'Packages'
  if (item.sourceModule === 'ticketing') return 'Ticketing'
  if (item.sourceModule === 'compensation') return 'Salary'
  if (item.sourceModule === 'adjustments') return 'Penalties'
  return 'Other'
}

const sourceCards = [
  'Ticketing',
  'Applications',
  'Packages',
  'Refunds',
  'Bonus',
  'Penalties',
  'Salary',
]

export default function CommissionStaffReport({
  employees,
}: {
  employees: CommissionStaffOption[]
}) {
  const currentMonth = londonMonth()
  const [period, setPeriod] = useState(currentMonth)
  const [report, setReport] = useState<StaffReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [preparedBatch, setPreparedBatch] = useState<PreparedBatch | null>(null)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || '')
  const [category, setCategory] = useState<'adm' | 'loss' | 'other'>('adm')
  const [amount, setAmount] = useState('')
  const [companyShare, setCompanyShare] = useState('0.00')
  const [currency, setCurrency] = useState('GBP')
  const [reason, setReason] = useState('')
  const [pnr, setPnr] = useState('')
  const [admReference, setAdmReference] = useState('')

  useEffect(() => {
    if (!employeeId && employees[0]?.id) setEmployeeId(employees[0].id)
  }, [employeeId, employees])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')
    setReviewConfirmed(false)
    try {
      const result = await fetchJson(
        `/api/commissions/admin/staff-report?period=${encodeURIComponent(period)}`,
      )
      const normalized = normalizeReport(result)
      setReport(normalized)
      setPreparedBatch(normalized.reviewBatch)
    } catch (loadError) {
      setReport(null)
      setError(loadError instanceof Error ? loadError.message : 'Unable to load staff report.')
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    setPreparedBatch(null)
    setReviewConfirmed(false)
    void loadReport()
  }, [loadReport])

  const sourceTotals = useMemo(() => {
    const totals = new Map(sourceCards.map((label) => [label, 0]))
    for (const item of report?.items || []) {
      const group = sourceGroup(item)
      totals.set(group, (totals.get(group) || 0) + item.amountGbp)
    }
    return totals
  }, [report])

  const ready = Boolean(
    report &&
    report.readiness.pendingEvents === 0 &&
    report.readiness.openExceptions === 0 &&
    report.readiness.incompleteBonusPeriods === 0,
  )
  const completedMonth = period < currentMonth
  const periodLocked = Boolean(
    preparedBatch && !['returned', 'superseded'].includes(preparedBatch.status),
  )
  const admOutsideCurrentMonth = category === 'adm' && period !== currentMonth
  const canPrepareBatch =
    !preparedBatch || preparedBatch.status === 'returned' || preparedBatch.status === 'superseded'

  async function addPenalty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy('penalty')
    setError('')
    setNotice('')
    try {
      await fetchJson('/api/commissions/admin/adjustments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey('penalty'),
        },
        body: JSON.stringify({
          employeeId,
          category,
          amount: Number(amount),
          companyShare: category === 'adm' ? Number(companyShare) : 0,
          currency: currency.trim().toUpperCase(),
          periodStart: `${period}-01`,
          reason,
          ...(category === 'adm' ? { pnr, admReference } : {}),
        }),
      })
      setAmount('')
      setCompanyShare('0.00')
      setReason('')
      setPnr('')
      setAdmReference('')
      setNotice('The penalty was appended to this reporting period.')
      await loadReport()
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Unable to add penalty.')
    } finally {
      setBusy('')
    }
  }

  async function prepareBatch() {
    setBusy('prepare')
    setError('')
    setNotice('')
    try {
      const result = await fetchJson('/api/commissions/admin/review-batches/prepare', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': requestKey('review-prepare'),
        },
        body: JSON.stringify({ periodStart: `${period}-01` }),
      })
      const batch = {
        id: text(result.id),
        revision: number(result.revision),
        status: text(result.status, 'draft'),
        contentHash: text(result.contentHash),
        entryCount: number(result.entryCount),
        isStale: false,
      }
      if (!batch.id || batch.revision < 1) throw new Error('The prepared batch was incomplete.')
      setPreparedBatch(batch)
      setReviewConfirmed(false)
      setNotice('The month is frozen as a draft. Confirm the review before sending it.')
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Unable to prepare the month.',
      )
    } finally {
      setBusy('')
    }
  }

  async function submitBatch() {
    if (!preparedBatch) return
    setBusy('submit')
    setError('')
    setNotice('')
    try {
      const result = await fetchJson(
        `/api/commissions/admin/review-batches/${encodeURIComponent(preparedBatch.id)}/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': requestKey('review-submit'),
          },
          body: JSON.stringify({ expectedRevision: preparedBatch.revision }),
        },
      )
      setPreparedBatch({
        ...preparedBatch,
        revision: number(result.revision) || preparedBatch.revision + 1,
        status: text(result.status, 'submitted_to_accounting'),
        isStale: false,
      })
      setNotice('The Commission report was sent to Accounting for independent review.')
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Unable to submit the batch.',
      )
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <label className="w-full max-w-xs space-y-1.5 text-sm text-slate-300">
            <span>Reporting month</span>
            <input
              aria-label="Reporting month"
              type="month"
              className={inputClass}
              value={period}
              max={currentMonth}
              onChange={(event) => setPeriod(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void loadReport()}
            disabled={loading || Boolean(busy)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-slate-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh report
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          {monthLabel(period)} uses only the latest Commission revision for each source fact. Native
          currencies stay separate; GBP is the common reporting value.
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200"
        >
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-200">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-xl border border-slate-800 bg-slate-900">
          <LoaderCircle
            aria-label="Loading staff report"
            className="h-7 w-7 animate-spin text-cyan-300"
          />
        </div>
      ) : report ? (
        <>
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                label="Staff total (GBP book)"
                value={formatMoney(report.companyTotalGbp)}
              />
              <SummaryCard
                label="Company ADM profit reduction"
                value={formatMoney(report.companyAdmImpactGbp)}
              />
              <SummaryCard label="Pending events" value={String(report.readiness.pendingEvents)} />
              <SummaryCard
                label="Open exceptions"
                value={String(report.readiness.openExceptions)}
              />
              <SummaryCard
                label="Incomplete bonuses"
                value={String(report.readiness.incompleteBonusPeriods)}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
              {sourceCards.map((label) => (
                <SummaryCard
                  key={label}
                  label={label}
                  value={formatMoney(sourceTotals.get(label) || 0)}
                  compact
                />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Staff commission breakdown</h2>
              <p className="mt-1 text-sm text-slate-400">
                Salary, source commission, bonuses and penalties are shown independently for every
                employee and pay currency.
              </p>
            </div>
            <StaffBreakdown report={report} />
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Source breakdown</h2>
              <p className="mt-1 text-sm text-slate-400">
                Applications and Packages remain visible as distinct Commission sources.
              </p>
            </div>
            <SourceBreakdown items={report.items} />
          </section>
        </>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={addPenalty}
          className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <h2 className="font-semibold text-amber-100">Append a penalty</h2>
              <p className="mt-1 text-xs leading-5 text-amber-200/70">
                ADM, loss and other deductions are append-only. An ADM is tied to its PNR and the
                ticket owner; its employee share reduces current Commission while its company share
                is retained as a current company-profit impact. Corrections require an audited
                reversal.
              </p>
            </div>
          </div>
          {periodLocked ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
              {preparedBatch?.status === 'approved_locked'
                ? 'Accounting locked this period. Post any later correction in the next open reporting month.'
                : `This reporting period already has a ${preparedBatch?.status.replace(/_/g, ' ')} batch. Resolve that review before adding another penalty.`}
            </div>
          ) : null}
          {admOutsideCurrentMonth ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">
              ADMs are posted when received. Select {monthLabel(currentMonth)} to add this ADM; the
              original ticket month will not be rewritten.
            </div>
          ) : null}
          {category !== 'adm' && (
            <label className="block space-y-1.5 text-sm text-slate-300">
              <span>Employee</span>
              <select
                aria-label="Penalty employee"
                className={inputClass}
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                required
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm text-slate-300">
              <span>Penalty type</span>
              <select
                aria-label="Penalty type"
                className={inputClass}
                value={category}
                onChange={(event) => setCategory(event.target.value as 'adm' | 'loss' | 'other')}
              >
                <option value="adm">ADM</option>
                <option value="loss">Company loss</option>
                <option value="other">Other deduction</option>
              </select>
            </label>
            <label className="space-y-1.5 text-sm text-slate-300">
              <span>Currency</span>
              <input
                aria-label="Penalty currency"
                className={inputClass}
                value={currency}
                maxLength={3}
                onChange={(event) => setCurrency(event.target.value.toUpperCase())}
                required
              />
            </label>
          </div>
          {category === 'adm' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5 text-sm text-slate-300">
                <span>Ticket PNR</span>
                <input
                  aria-label="ADM ticket PNR"
                  className={inputClass}
                  value={pnr}
                  onChange={(event) => setPnr(event.target.value.toUpperCase())}
                  required
                />
                <span className="block text-[11px] text-slate-500">
                  The responsible agent is taken from this ticket.
                </span>
              </label>
              <label className="space-y-1.5 text-sm text-slate-300">
                <span>Airline ADM reference</span>
                <input
                  aria-label="ADM reference"
                  className={inputClass}
                  value={admReference}
                  onChange={(event) => setAdmReference(event.target.value)}
                  required
                />
              </label>
            </div>
          )}
          <label className="block space-y-1.5 text-sm text-slate-300">
            <span>{category === 'adm' ? 'Employee responsibility share' : 'Amount'}</span>
            <input
              aria-label="Penalty amount"
              className={inputClass}
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </label>
          {category === 'adm' && (
            <label className="block space-y-1.5 text-sm text-slate-300">
              <span>Company responsibility share</span>
              <input
                aria-label="ADM company share"
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                value={companyShare}
                onChange={(event) => setCompanyShare(event.target.value)}
                required
              />
              <span className="block text-[11px] text-slate-500">
                Total ADM: {formatMoney(number(amount) + number(companyShare), currency)}
              </span>
            </label>
          )}
          <label className="block space-y-1.5 text-sm text-slate-300">
            <span>Reason</span>
            <textarea
              aria-label="Penalty reason"
              className={inputClass}
              rows={3}
              minLength={3}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              required
            />
          </label>
          <button
            className={primaryButtonClass}
            disabled={Boolean(busy) || !employees.length || periodLocked || admOutsideCurrentMonth}
          >
            {busy === 'penalty' ? 'Adding penalty…' : 'Add audited penalty'}
          </button>
        </form>

        <section className="space-y-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5">
          <div className="flex items-start gap-3">
            <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
            <div>
              <h2 className="font-semibold text-cyan-100">Send to Accounting</h2>
              <p className="mt-1 text-xs leading-5 text-cyan-200/70">
                A completed month is frozen with a content hash before independent Accounting
                review. Submitted figures can only be returned or approved and locked.
              </p>
            </div>
          </div>

          <div
            className={`flex items-start gap-3 rounded-lg border p-4 ${
              ready
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
            }`}
          >
            {ready ? (
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            )}
            <p className="text-sm">
              {ready
                ? 'No pending events, open exceptions or incomplete bonus periods were found.'
                : 'Resolve every pending event, exception and incomplete bonus before preparing.'}
            </p>
          </div>

          {!completedMonth && (
            <p className="text-sm text-slate-400">
              The current month remains open. Select a completed reporting month to prepare it.
            </p>
          )}

          {canPrepareBatch ? (
            <div className="space-y-3">
              {preparedBatch?.status === 'returned' ? (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                  Accounting returned revision {preparedBatch.revision}. Apply the requested
                  corrections, then prepare a new immutable revision.
                </p>
              ) : null}
              <button
                type="button"
                className={primaryButtonClass}
                disabled={Boolean(busy) || loading || !ready || !completedMonth}
                onClick={() => void prepareBatch()}
              >
                {busy === 'prepare' ? 'Preparing…' : `Prepare ${monthLabel(period)}`}
              </button>
            </div>
          ) : preparedBatch.status === 'approved_locked' ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <p>Accounting approved and permanently locked revision {preparedBatch.revision}.</p>
            </div>
          ) : preparedBatch.status === 'submitted_to_accounting' ? (
            <div
              className={`rounded-lg border p-4 text-sm ${
                preparedBatch.isStale
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              }`}
            >
              {preparedBatch.isStale
                ? `Revision ${preparedBatch.revision} changed after submission. Accounting must return it before Commission Admin prepares the correction.`
                : `Sent to Accounting. Batch revision ${preparedBatch.revision} is awaiting independent review.`}
            </div>
          ) : preparedBatch.isStale ? (
            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              <p>
                Draft revision {preparedBatch.revision} no longer matches the current Commission
                results. Replace it with a fresh immutable snapshot before review.
              </p>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={Boolean(busy) || loading || !ready || !completedMonth}
                onClick={() => void prepareBatch()}
              >
                {busy === 'prepare' ? 'Replacing…' : 'Replace stale draft'}
              </button>
            </div>
          ) : preparedBatch.status !== 'draft' ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              This review batch has an unsupported state. Refresh the report before taking any
              action.
            </div>
          ) : (
            <div className="space-y-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
              <div className="text-sm text-slate-300">
                <p>
                  Draft batch: <span className="font-mono text-white">{preparedBatch.id}</span>
                </p>
                <p className="mt-1">
                  {preparedBatch.entryCount} entries · revision {preparedBatch.revision}
                </p>
                {preparedBatch.contentHash && (
                  <p className="mt-1 truncate font-mono text-xs text-slate-500">
                    {preparedBatch.contentHash}
                  </p>
                )}
              </div>
              <label className="flex items-start gap-3 text-sm text-slate-300">
                <input
                  aria-label="Confirm Commission review"
                  type="checkbox"
                  className="mt-1"
                  checked={reviewConfirmed}
                  onChange={(event) => setReviewConfirmed(event.target.checked)}
                />
                <span>I reviewed each employee, currency and source total above.</span>
              </label>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={Boolean(busy) || !reviewConfirmed}
                onClick={() => void submitBatch()}
              >
                <Send className="mr-2 h-4 w-4" />
                {busy === 'submit' ? 'Sending…' : 'Submit to Accounting'}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  compact = false,
}: {
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 font-bold text-white ${compact ? 'text-xl' : 'text-2xl'}`}>{value}</p>
    </div>
  )
}

function StaffBreakdown({ report }: { report: StaffReport }) {
  return (
    <ReportTable
      headers={[
        'Employee',
        'Currency',
        'Salary',
        'Ticketing',
        'Applications',
        'Packages',
        'Refunds',
        'Bonus',
        'Penalties',
        'Native total',
        'GBP total',
      ]}
      empty="No staff Commission values exist for this month."
      rows={report.currencyTotals.map((total) => {
        const items = report.items.filter(
          (item) => item.employeeId === total.employeeId && item.payCurrency === total.payCurrency,
        )
        const amount = (group: string) =>
          items
            .filter((item) => sourceGroup(item) === group)
            .reduce((sum, item) => sum + item.amountPayCurrency, 0)
        return [
          total.employeeName,
          total.payCurrency,
          formatMoney(amount('Salary'), total.payCurrency),
          formatMoney(amount('Ticketing'), total.payCurrency),
          formatMoney(amount('Applications'), total.payCurrency),
          formatMoney(amount('Packages'), total.payCurrency),
          formatMoney(amount('Refunds'), total.payCurrency),
          formatMoney(amount('Bonus'), total.payCurrency),
          formatMoney(amount('Penalties'), total.payCurrency),
          formatMoney(total.amountPayCurrency, total.payCurrency),
          formatMoney(total.amountGbp),
        ]
      })}
    />
  )
}

function SourceBreakdown({ items }: { items: StaffReportItem[] }) {
  return (
    <ReportTable
      headers={['Employee', 'Source', 'Service', 'Kind', 'Entries', 'Native total', 'GBP total']}
      empty="No source totals exist for this month."
      rows={items.map((item) => [
        item.employeeName,
        sourceGroup(item),
        item.serviceCode.replace(/_/g, ' '),
        item.entryKind.replace(/_/g, ' '),
        item.entryCount,
        formatMoney(item.amountPayCurrency, item.payCurrency),
        formatMoney(item.amountGbp),
      ])}
    />
  )
}

function ReportTable({
  headers,
  rows,
  empty,
}: {
  headers: string[]
  rows: React.ReactNode[][]
  empty: string
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-slate-950/70 text-slate-400">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-4 py-3 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={`px-4 py-3 ${cellIndex === 0 ? 'font-medium text-white' : 'text-slate-300'}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <div className="p-8 text-center text-sm text-slate-500">{empty}</div>}
    </div>
  )
}
