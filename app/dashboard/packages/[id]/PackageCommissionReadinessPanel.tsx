'use client'

import { AlertTriangle, Check, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { formatMoney } from '@/lib/packageQuote'
import {
  getPackageCommissionEventErrorLabel,
  getPackageCommissionIssueLabel,
  type PackageCommissionReadiness,
} from '@/lib/commissions/packageReadiness'
import type { PackageLocationOption } from './packageOverviewTypes'

type PackageCommissionReadinessPanelProps = {
  readiness: PackageCommissionReadiness | null
  loading: boolean
  error: string | null
  projectedMargin: number
  currency: string
  suggestedLocation: PackageLocationOption | null
  saving: boolean
  onRefresh: () => void
  onAutoResolve: () => void
}

function commissionReadinessCopy(readiness: PackageCommissionReadiness) {
  switch (readiness.state) {
    case 'ready_to_close':
      return {
        title: 'Ready for Commission handoff',
        detail:
          'After the customer returns, mark the folder Complete - Checked. Commission is then calculated from the reservation records and dated three days after return.',
        style: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      }
    case 'processed':
      return {
        title: 'Commission shadow calculation completed',
        detail:
          'This Complete - Checked package has been calculated from its reservation records and is visible to Commission Admin.',
        style: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      }
    case 'processing':
      return {
        title: 'Commission calculation in progress',
        detail: 'The source is being checked against the employee commission plan.',
        style: 'border-cyan-200 bg-cyan-50 text-cyan-950',
      }
    case 'awaiting_processing':
      return {
        title: 'Sent to Commission',
        detail: 'The source is queued for its non-payable shadow calculation.',
        style: 'border-cyan-200 bg-cyan-50 text-cyan-950',
      }
    case 'held':
      return {
        title: 'Commission Admin review needed',
        detail: 'The source is retained safely but cannot be calculated yet.',
        style: 'border-amber-200 bg-amber-50 text-amber-950',
      }
    case 'rejected':
      return {
        title: 'Commission handoff rejected',
        detail: 'Commission Admin needs to review this source record.',
        style: 'border-red-200 bg-red-50 text-red-950',
      }
    default:
      return {
        title: 'Commission handoff needs attention',
        detail:
          readiness.stage === 'closed'
            ? 'The closed package is retained but its Commission calculation will be held.'
            : 'Resolve these source checks for a clean handoff when the package is closed.',
        style: 'border-amber-200 bg-amber-50 text-amber-950',
      }
  }
}

export function PackageCommissionReadinessPanel({
  readiness,
  loading,
  error,
  projectedMargin,
  currency,
  suggestedLocation,
  saving,
  onRefresh,
  onAutoResolve,
}: PackageCommissionReadinessPanelProps) {
  const display = readiness ? commissionReadinessCopy(readiness) : null
  const eventError = getPackageCommissionEventErrorLabel(readiness?.eventError || null)

  return (
    <div
      data-testid="package-commission-readiness"
      className={`border p-4 ${display?.style || 'border-slate-200 bg-slate-50 text-slate-950'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 bg-white/80 p-2">
            {readiness?.handoffReady ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <AlertTriangle className="h-5 w-5" />
            )}
          </div>
          <div>
            <p className="text-sm font-black">{display?.title || 'Commission handoff'}</p>
            <p className="mt-1 text-xs font-semibold leading-5 opacity-80">
              {loading && !readiness
                ? 'Checking the package source records.'
                : display?.detail || error || 'Commission readiness is unavailable.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh Commission readiness"
          className="border border-current/20 bg-white/70 p-2 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
      </div>

      {readiness && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="bg-white/70 p-2">
              <p className="text-[10px] font-bold uppercase opacity-70">Passengers</p>
              <p className="mt-1 text-lg font-black">{readiness.passengerCount}</p>
            </div>
            <div className="bg-white/70 p-2">
              <p className="text-[10px] font-bold uppercase opacity-70">Source rows</p>
              <p className="mt-1 text-lg font-black">{readiness.calculationRowCount}</p>
            </div>
            <div className="bg-white/70 p-2">
              <p className="text-[10px] font-bold uppercase opacity-70">References</p>
              <p className="mt-1 text-lg font-black">{readiness.invoiceReferenceRowCount}</p>
            </div>
            <div className="bg-white/70 p-2">
              <p className="text-[10px] font-bold uppercase opacity-70">Projected margin</p>
              <p className="mt-1 text-sm font-black">{formatMoney(projectedMargin, currency)}</p>
            </div>
          </div>

          {readiness.issues.length > 0 && (
            <ul className="mt-4 space-y-2 text-xs font-semibold leading-5">
              {readiness.issues.map((issue) => (
                <li key={issue} className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {issue === 'missing_package_location'
                      ? suggestedLocation
                        ? `Choose the package branch. The sales owner belongs to ${suggestedLocation.name}${suggestedLocation.branch_code ? ` (${suggestedLocation.branch_code})` : ''}.`
                        : 'Choose the office branch responsible for this package in the Responsible agents section above.'
                      : getPackageCommissionIssueLabel(issue)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onAutoResolve}
            disabled={saving}
            className="mt-4 inline-flex items-center gap-2 border border-current/30 bg-white px-3 py-2 text-xs font-black disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {readiness.issues.length > 0
              ? 'Resolve safe fixes automatically'
              : 'Refresh safe reconciliation'}
          </button>

          {eventError && (
            <p className="mt-4 border border-current/20 bg-white/70 p-2 text-xs font-bold leading-5">
              {eventError}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-current/15 pt-3 text-[11px] font-bold opacity-75">
            <span>Preview until Admin payroll approval</span>
            {readiness.eventVersion && <span>Source version {readiness.eventVersion}</span>}
          </div>
        </>
      )}

      {error && readiness && (
        <p className="mt-3 text-xs font-semibold opacity-75">Last refresh failed: {error}</p>
      )}
    </div>
  )
}
