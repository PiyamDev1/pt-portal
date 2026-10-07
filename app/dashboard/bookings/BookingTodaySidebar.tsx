import { ClockIcon, PlusIcon } from './BookingIcons'

type NextBookingSummary = {
  timeLabel: string
  customerName: string
  serviceName: string
}

type BookingTodaySidebarProps = {
  appointmentCount: number
  pendingCount: number
  confirmedCount: number
  nextBooking: NextBookingSummary | null
  canCreateAppointment: boolean
  activeWaitlistCount: number
  onOpenNextBooking: () => void
  onFindAvailableTime: () => void
  onAddAppointmentDetails: () => void
  onAddToWaitlist: () => void
}

export default function BookingTodaySidebar({
  appointmentCount,
  pendingCount,
  confirmedCount,
  nextBooking,
  canCreateAppointment,
  activeWaitlistCount,
  onOpenNextBooking,
  onFindAvailableTime,
  onAddAppointmentDetails,
  onAddToWaitlist,
}: BookingTodaySidebarProps) {
  return (
    <aside className="space-y-4">
      <section className="rounded-[24px] border border-indigo-100 bg-[linear-gradient(145deg,_#eef2ff_0%,_#ffffff_72%)] p-5 shadow-[0_18px_50px_-32px_rgba(79,70,229,0.45)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Daily queue</p>
            <p className="mt-1 text-xs text-slate-500">Visible appointments for this day.</p>
          </div>
          <span className="rounded-xl bg-indigo-600 px-2.5 py-1 text-sm font-bold text-white">
            {appointmentCount}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
              To confirm
            </dt>
            <dd className="mt-1 text-xl font-semibold text-amber-900">{pendingCount}</dd>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Confirmed
            </dt>
            <dd className="mt-1 text-xl font-semibold text-emerald-900">{confirmedCount}</dd>
          </div>
        </dl>
        <div className="mt-4 rounded-xl border border-white bg-white/80 px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Next up
          </p>
          {nextBooking ? (
            <button onClick={onOpenNextBooking} className="ui-focus mt-1 w-full text-left">
              <p className="text-sm font-semibold text-slate-800">
                {nextBooking.timeLabel} · {nextBooking.customerName}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{nextBooking.serviceName}</p>
            </button>
          ) : (
            <p className="mt-1 text-sm text-slate-500">No remaining appointments on this day.</p>
          )}
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-800">Desk actions</p>
        <p className="mt-1 text-xs text-slate-500">
          {canCreateAppointment
            ? 'Start from an available time or add the appointment details directly.'
            : 'Past dates cannot accept new appointments.'}
        </p>
        <div className="mt-4 grid gap-2">
          <button
            onClick={onFindAvailableTime}
            disabled={!canCreateAppointment}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <ClockIcon className="h-4 w-4" />
            Find an available time
          </button>
          <button
            onClick={onAddAppointmentDetails}
            disabled={!canCreateAppointment}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <PlusIcon className="h-4 w-4" />
            Add appointment details
          </button>
        </div>
      </section>

      <section className="rounded-[24px] border border-amber-200 bg-amber-50/70 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-amber-950">Waiting list</p>
            <p className="mt-1 text-xs text-amber-800">
              {activeWaitlistCount > 0
                ? `${activeWaitlistCount} customer${activeWaitlistCount === 1 ? '' : 's'} still need a slot.`
                : 'No customer is currently waiting for a slot.'}
            </p>
          </div>
          {activeWaitlistCount > 0 && (
            <span className="rounded-full bg-amber-200 px-2.5 py-1 text-xs font-bold text-amber-900">
              {activeWaitlistCount}
            </span>
          )}
        </div>
        <button
          onClick={onAddToWaitlist}
          className="ui-tap ui-focus mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          Add to waiting list
        </button>
      </section>
    </aside>
  )
}
