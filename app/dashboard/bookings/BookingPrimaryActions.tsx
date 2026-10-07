import { PlusIcon, RefreshIcon, SettingsIcon, SparkIcon } from './BookingIcons'

type BookingPrimaryActionsProps = {
  variant: 'mobile' | 'desktop'
  isAdmin: boolean
  showSettings: boolean
  refreshing: boolean
  hasSelectedLocation: boolean
  onToggleSettings: () => void
  onAddAppointment: () => void
  onRefresh: () => void
  onMemberService: () => void
}

export default function BookingPrimaryActions({
  variant,
  isAdmin,
  showSettings,
  refreshing,
  hasSelectedLocation,
  onToggleSettings,
  onAddAppointment,
  onRefresh,
  onMemberService,
}: BookingPrimaryActionsProps) {
  const mobile = variant === 'mobile'

  return (
    <>
      {isAdmin && (
        <button
          onClick={onToggleSettings}
          className={
            mobile
              ? `ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ${
                  showSettings
                    ? 'border-red-700 bg-red-700 text-white'
                    : 'border-slate-200 bg-white text-slate-700'
                }`
              : `ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all hover:-translate-y-0.5 sm:text-sm ${
                  showSettings
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`
          }
        >
          <SettingsIcon className="h-4 w-4" />
          {showSettings ? 'Back to Appointments' : 'Booking Settings'}
        </button>
      )}

      {!showSettings &&
        (mobile ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onAddAppointment}
              className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#8b1d2c] px-3 text-sm font-semibold text-white shadow-sm"
            >
              <PlusIcon className="h-4 w-4" />
              Add
            </button>
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              <RefreshIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onMemberService}
              disabled={!hasSelectedLocation}
              className="ui-tap ui-focus col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-[#7f1d2d]/25 bg-red-50 px-3 text-sm font-semibold text-[#7f1d2d] disabled:opacity-50"
            >
              <SparkIcon className="h-4 w-4" />
              Member Service
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={onAddAppointment}
              className="ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border border-indigo-600 bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-indigo-700 sm:text-sm"
            >
              <PlusIcon className="h-4 w-4" />
              Add Appointment
            </button>
            <button
              onClick={onMemberService}
              disabled={!hasSelectedLocation}
              className="ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border border-[#7f1d2d]/25 bg-red-50 px-3 py-2 text-xs font-semibold text-[#7f1d2d] transition-all hover:-translate-y-0.5 hover:bg-red-100 disabled:opacity-50 sm:text-sm"
            >
              <SparkIcon className="h-4 w-4" />
              Member Service
            </button>
          </>
        ))}
    </>
  )
}
