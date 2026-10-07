import { BookingSource, BookingStatus } from '@/app/types/bookings'
import type { BookingServiceOption } from './bookingClientModel'
import { RefreshIcon } from './BookingIcons'

type BookingWorkspaceToolsProps = {
  sourceFilter: 'all' | BookingSource
  statusFilter: 'all' | BookingStatus
  serviceFilter: string
  serviceOptions: BookingServiceOption[]
  showCancelled: boolean
  refreshing: boolean
  onResetFilters: () => void
  onSourceChange: (value: 'all' | BookingSource) => void
  onStatusChange: (value: 'all' | BookingStatus) => void
  onServiceChange: (value: string) => void
  onShowCancelledChange: (value: boolean) => void
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
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <select
              value={sourceFilter}
              onChange={(event) => onSourceChange(event.target.value as 'all' | BookingSource)}
              aria-label="Booking source"
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all">All sources</option>
              <option value={BookingSource.PORTAL}>Portal</option>
              <option value={BookingSource.WHATSAPP}>WhatsApp</option>
              <option value={BookingSource.WEBSITE}>Website</option>
            </select>
            <select
              value={statusFilter}
              onChange={(event) => onStatusChange(event.target.value as 'all' | BookingStatus)}
              aria-label="Appointment status"
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all">All statuses</option>
              <option value={BookingStatus.PENDING}>Pending</option>
              <option value={BookingStatus.CONFIRMED}>Confirmed</option>
              <option value={BookingStatus.COMPLETED}>Completed</option>
              <option value={BookingStatus.CANCELLED}>Cancelled</option>
            </select>
            <select
              value={serviceFilter}
              onChange={(event) => onServiceChange(event.target.value)}
              aria-label="Booking service"
              className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
            >
              <option value="all">All services</option>
              {serviceOptions.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
            <label className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(event) => onShowCancelledChange(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              Include cancelled
            </label>
          </div>
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
