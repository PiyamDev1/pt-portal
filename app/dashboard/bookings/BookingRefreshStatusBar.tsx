import { ClockIcon, ConfirmedIcon, EyeIcon, PendingIcon } from './BookingIcons'

type BookingRefreshStatusBarProps = {
  refreshLabel: string
  refreshing: boolean
  autoRefresh: boolean
  refreshCountdown: number
  loadError: string | null
  totalVisible: number
  pendingVisible: number
  confirmedVisible: number
  onRetry: () => void
}

export default function BookingRefreshStatusBar({
  refreshLabel,
  refreshing,
  autoRefresh,
  refreshCountdown,
  loadError,
  totalVisible,
  pendingVisible,
  confirmedVisible,
  onRetry,
}: BookingRefreshStatusBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs text-slate-500 shadow-sm">
      <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
        <ClockIcon className="h-4 w-4 text-slate-400" />
        Last updated: {refreshLabel}
      </span>
      {refreshing && (
        <span className="rounded-full bg-indigo-50 px-2 py-1 font-medium text-indigo-600">
          Checking for changes...
        </span>
      )}
      {autoRefresh && !refreshing && (
        <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500 tabular-nums">
          Next refresh in {refreshCountdown}s
        </span>
      )}
      {!autoRefresh && (
        <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-600">
          Auto-refresh paused
        </span>
      )}
      {loadError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800"
        >
          <span>{loadError}</span>
          <button
            onClick={onRetry}
            disabled={refreshing}
            className="ui-focus font-semibold underline underline-offset-2 disabled:opacity-50"
          >
            Retry
          </button>
        </div>
      )}
      <span className="ui-tap inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
        <EyeIcon className="h-4 w-4 text-slate-500" />
        Visible {totalVisible}
      </span>
      <span className="ui-tap inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
        <PendingIcon className="h-4 w-4" />
        Pending {pendingVisible}
      </span>
      <span className="ui-tap inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
        <ConfirmedIcon className="h-4 w-4" />
        Confirmed {confirmedVisible}
      </span>
    </div>
  )
}
