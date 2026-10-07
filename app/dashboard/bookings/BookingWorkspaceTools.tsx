import BookingFilterFields, { type BookingFilterFieldsProps } from './BookingFilterFields'
import { RefreshIcon } from './BookingIcons'

type BookingWorkspaceToolsProps = Omit<BookingFilterFieldsProps, 'variant'> & {
  refreshing: boolean
  onResetFilters: () => void
  onRefresh: () => void
  onSaveView: () => void
  onExport: () => void
}

export default function BookingWorkspaceTools({
  sourceFilter,
  statusFilter,
  serviceFilter,
  serviceOptions,
  showCancelled,
  refreshing,
  onResetFilters,
  onSourceChange,
  onStatusChange,
  onServiceChange,
  onShowCancelledChange,
  onRefresh,
  onSaveView,
  onExport,
}: BookingWorkspaceToolsProps) {
  return (
    <div
      className="bookings-desktop-only hidden rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 shadow-sm md:block"
      aria-label="Booking filters and workspace tools"
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Narrow this view</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Filters apply to this workspace. Exports include the chosen date, location, source,
                and status.
              </p>
            </div>
            <button
              onClick={onResetFilters}
              className="ui-tap ui-focus text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              Reset filters
            </button>
          </div>
          <BookingFilterFields
            variant="desktop"
            sourceFilter={sourceFilter}
            statusFilter={statusFilter}
            serviceFilter={serviceFilter}
            serviceOptions={serviceOptions}
            showCancelled={showCancelled}
            onSourceChange={onSourceChange}
            onStatusChange={onStatusChange}
            onServiceChange={onServiceChange}
            onShowCancelledChange={onShowCancelledChange}
          />
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="ui-tap ui-focus inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
          <button
            onClick={onSaveView}
            className="ui-tap ui-focus min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Save view
          </button>
          <button
            onClick={onExport}
            className="ui-tap ui-focus min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  )
}
