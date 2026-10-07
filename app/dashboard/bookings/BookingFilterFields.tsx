import { BookingSource, BookingStatus } from '@/app/types/bookings'
import type { BranchLocationOption } from '@/app/dashboard/settings/components/BookingSettingsTab'
import { PinIcon } from './BookingIcons'
import type { BookingServiceOption } from './bookingClientModel'

export type BookingFilterFieldsProps = {
  variant: 'mobile' | 'desktop'
  sourceFilter: 'all' | BookingSource
  statusFilter: 'all' | BookingStatus
  serviceFilter: string
  serviceOptions: BookingServiceOption[]
  showCancelled: boolean
  onSourceChange: (value: 'all' | BookingSource) => void
  onStatusChange: (value: 'all' | BookingStatus) => void
  onServiceChange: (value: string) => void
  onShowCancelledChange: (value: boolean) => void
}

type BookingLocationSelectProps = {
  variant: 'mobile' | 'desktop'
  locations: BranchLocationOption[]
  selectedLocationId: string
  onChange: (locationId: string) => void
}

export default function BookingFilterFields({
  variant,
  sourceFilter,
  statusFilter,
  serviceFilter,
  serviceOptions,
  showCancelled,
  onSourceChange,
  onStatusChange,
  onServiceChange,
  onShowCancelledChange,
}: BookingFilterFieldsProps) {
  const selectClassName =
    variant === 'mobile'
      ? 'min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
      : 'min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
  const checkboxLabelClassName =
    variant === 'mobile'
      ? 'inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
      : 'inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
  const checkboxClassName = `h-4 w-4 rounded border-slate-300 ${
    variant === 'mobile' ? 'text-red-700' : 'text-indigo-600'
  }`

  return (
    <div
      className={variant === 'mobile' ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-2 lg:grid-cols-4'}
    >
      <select
        value={sourceFilter}
        onChange={(event) => onSourceChange(event.target.value as 'all' | BookingSource)}
        aria-label="Booking source"
        className={selectClassName}
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
        className={selectClassName}
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
        className={selectClassName}
      >
        <option value="all">All services</option>
        {serviceOptions.map((service) => (
          <option key={service.id} value={service.id}>
            {service.name}
          </option>
        ))}
      </select>
      <label className={checkboxLabelClassName}>
        <input
          type="checkbox"
          checked={showCancelled}
          onChange={(event) => onShowCancelledChange(event.target.checked)}
          className={checkboxClassName}
        />
        Show cancelled
      </label>
    </div>
  )
}

export function BookingLocationSelect({
  variant,
  locations,
  selectedLocationId,
  onChange,
}: BookingLocationSelectProps) {
  if (locations.length === 0) return null

  const select = (
    <select
      value={selectedLocationId}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Branch location"
      className={
        variant === 'mobile'
          ? 'min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700'
          : 'rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 transition-colors hover:border-slate-300 sm:text-sm'
      }
    >
      {locations.map((location) => (
        <option key={location.id} value={location.id}>
          {location.name}
          {location.branch_code ? ` (${location.branch_code})` : ''}
        </option>
      ))}
    </select>
  )

  if (variant === 'mobile') return select

  return (
    <div className="relative">
      <PinIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      {select}
    </div>
  )
}
