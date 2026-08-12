'use client'

import { memo, useMemo } from 'react'
import { BookingStatus } from '@/app/types/bookings'
import {
  SOURCE_CONFIG,
  STATUS_ACCESSIBILITY,
  STATUS_CONFIG,
  formatDateLabel,
  formatLongDateLabel,
  formatMinutesLabel,
  formatTime,
  formatTimeFromMinutes,
  getServicePersonUnits,
  getUtcMinutesOfDay,
  isSameUTCDay,
  personCountLabel,
  type BookingServiceOption,
  type BookingWithService,
  type SlotOption,
} from './bookingClientModel'
import { CheckIcon, CloseIcon, DoneIcon, PencilIcon } from './BookingIcons'

export function SelectedDayPanel({
  selectedDate,
  today,
  selectedBookings,
  loading,
  updatingId,
  onStatusChange,
  onEditBooking,
  onOpenHistory,
  onResendEmail,
  resendingBookingId,
  selectedDateCount,
  onOpenDayAgenda,
  enableQuickAvailability,
  serviceOptions,
  quickServiceId,
  quickPersonCount,
  quickSlots,
  quickSlotsLoading,
  quickSlotsError,
  onQuickServiceChange,
  onQuickPersonCountChange,
  onQuickSelectSlot,
}: {
  selectedDate: Date
  today: Date
  selectedBookings: BookingWithService[]
  loading: boolean
  updatingId: string | null
  onStatusChange: (id: string, status: string) => void
  onEditBooking: (booking: BookingWithService) => void
  onOpenHistory: (bookingId: string) => void
  onResendEmail: (booking: BookingWithService) => void | Promise<void>
  resendingBookingId: string | null
  selectedDateCount: number
  onOpenDayAgenda: () => void
  enableQuickAvailability: boolean
  serviceOptions: BookingServiceOption[]
  quickServiceId: string
  quickPersonCount: number
  quickSlots: SlotOption[]
  quickSlotsLoading: boolean
  quickSlotsError: string | null
  onQuickServiceChange: (value: string) => void
  onQuickPersonCountChange: (value: number) => void
  onQuickSelectSlot: (slot: SlotOption) => void
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-5 py-4">
        <button onClick={onOpenDayAgenda} className="text-left">
          <h2 className="font-semibold text-slate-800 hover:text-indigo-700 transition-colors">
            {formatDateLabel(selectedDate)}
            {isSameUTCDay(selectedDate, today) && (
              <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                Today
              </span>
            )}
          </h2>
        </button>
        <span className="text-sm text-slate-400">
          {loading
            ? 'Loading…'
            : `${selectedDateCount} appointment${selectedDateCount !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading appointments…</div>
      ) : selectedBookings.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8">
            <p className="text-base font-semibold text-slate-700">No appointments on this day</p>
            <p className="mt-2 text-sm text-slate-400">
              Use the agenda or click directly in the week timeline to create the next booking.
            </p>
          </div>
          {enableQuickAvailability && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Available appointments
              </p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm text-slate-700">
                  Service
                  <select
                    value={quickServiceId}
                    onChange={(e) => onQuickServiceChange(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2"
                  >
                    <option value="">Select service</option>
                    {serviceOptions.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  {personCountLabel(
                    serviceOptions.find((service) => service.id === quickServiceId),
                  )}
                  <input
                    type="number"
                    min={1}
                    value={quickPersonCount}
                    onChange={(e) => onQuickPersonCountChange(Number(e.target.value) || 1)}
                    className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-3 min-h-[88px] rounded border border-slate-200 bg-white p-3">
                {quickSlotsLoading ? (
                  <p className="text-sm text-slate-400">Loading slots...</p>
                ) : quickSlotsError ? (
                  <p className="text-sm text-amber-700">{quickSlotsError}</p>
                ) : !quickServiceId ? (
                  <p className="text-sm text-slate-400">Select a service to see slots.</p>
                ) : quickSlots.length === 0 ? (
                  <p className="text-sm text-slate-400">No slots available for this date.</p>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    {quickSlots.slice(0, 12).map((slot) => (
                      <button
                        key={slot.isoString}
                        type="button"
                        onClick={() => onQuickSelectSlot(slot)}
                        className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-white text-sm text-slate-700 hover:border-indigo-400"
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {selectedBookings
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
            .map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                onStatusChange={onStatusChange}
                onEditBooking={onEditBooking}
                onOpenHistory={onOpenHistory}
                onResendEmail={onResendEmail}
                resendingBookingId={resendingBookingId}
                updatingId={updatingId}
              />
            ))}
        </div>
      )}
    </div>
  )
}

export function DayAgendaModal({
  selectedDate,
  today,
  bookings,
  serviceOptions,
  serviceId,
  personCount,
  loadingSlots,
  slots,
  slotsError,
  onClose,
  onServiceChange,
  onPersonCountChange,
  onSelectSlot,
  onSelectBooking,
}: {
  selectedDate: Date
  today: Date
  bookings: BookingWithService[]
  serviceOptions: BookingServiceOption[]
  serviceId: string
  personCount: number
  loadingSlots: boolean
  slots: SlotOption[]
  slotsError: string | null
  onClose: () => void
  onServiceChange: (value: string) => void
  onPersonCountChange: (value: number) => void
  onSelectSlot: (slot: SlotOption) => void
  onSelectBooking: (booking: BookingWithService) => void
}) {
  const selectedService = serviceOptions.find((service) => service.id === serviceId)
  const effectiveDuration = selectedService
    ? selectedService.duration_minutes +
      getServicePersonUnits(selectedService, personCount) *
        selectedService.duration_per_additional_person_minutes
    : null
  const nextStartGap = selectedService
    ? effectiveDuration! + Math.max(0, selectedService.buffer_minutes)
    : null

  const timeline = useMemo(() => {
    const ordered = bookings
      .slice()
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    const items: Array<
      | { type: 'gap'; key: string; minutes: number }
      | { type: 'overlap'; key: string; minutes: number }
      | {
          type: 'booking'
          key: string
          booking: BookingWithService
          startMinutes: number
          endMinutes: number
        }
    > = []

    let previousEnd: number | null = null
    let totalGapMinutes = 0
    let overlapCount = 0

    for (const booking of ordered) {
      const startMinutes = getUtcMinutesOfDay(booking.start_time)
      if (startMinutes === null) continue

      const parsedEnd = getUtcMinutesOfDay(booking.end_time)
      const fallbackEnd =
        startMinutes + Math.max(1, booking.booking_services?.duration_minutes ?? 30)
      const endMinutes = parsedEnd !== null && parsedEnd > startMinutes ? parsedEnd : fallbackEnd

      if (previousEnd !== null) {
        const delta = startMinutes - previousEnd
        if (delta > 0) {
          totalGapMinutes += delta
          items.push({
            type: 'gap',
            key: `gap-${booking.id}`,
            minutes: delta,
          })
        } else if (delta < 0) {
          overlapCount += 1
          items.push({
            type: 'overlap',
            key: `overlap-${booking.id}`,
            minutes: Math.abs(delta),
          })
        }
      }

      items.push({
        type: 'booking',
        key: booking.id,
        booking,
        startMinutes,
        endMinutes,
      })

      previousEnd = previousEnd === null ? endMinutes : Math.max(previousEnd, endMinutes)
    }

    return {
      items,
      totalGapMinutes,
      overlapCount,
    }
  }, [bookings])

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/45 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_28px_90px_-36px_rgba(15,23,42,0.5)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#eef2ff_100%)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {formatLongDateLabel(selectedDate)}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {bookings.length} booked appointment{bookings.length !== 1 ? 's' : ''}
              {isSameUTCDay(selectedDate, today) ? ' · Today' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-r border-slate-200 p-5 bg-white">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Booked appointments
              </h3>
              <span className="text-xs text-slate-400">Click a booking to modify or cancel</span>
            </div>
            {bookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                No appointments booked for this day.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-3 py-2 shadow-sm">
                  <p className="text-xs text-slate-600">
                    Total idle gaps:{' '}
                    <span className="font-semibold text-slate-800">
                      {formatMinutesLabel(timeline.totalGapMinutes)}
                    </span>
                    {' · '}
                    Overlaps:{' '}
                    <span
                      className={`font-semibold ${timeline.overlapCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}
                    >
                      {timeline.overlapCount}
                    </span>
                  </p>
                </div>

                <div className="space-y-2">
                  {timeline.items.map((item) => {
                    if (item.type === 'gap') {
                      return (
                        <div
                          key={item.key}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
                        >
                          Gap: {formatMinutesLabel(item.minutes)}
                        </div>
                      )
                    }

                    if (item.type === 'overlap') {
                      return (
                        <div
                          key={item.key}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                        >
                          Overlap detected: {formatMinutesLabel(item.minutes)}
                        </div>
                      )
                    }

                    const status = STATUS_CONFIG[item.booking.status] ?? STATUS_CONFIG.pending
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => onSelectBooking(item.booking)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/30 hover:shadow-md"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-slate-800">
                              {formatTimeFromMinutes(item.startMinutes)}-
                              {formatTimeFromMinutes(item.endMinutes)} ·{' '}
                              {item.booking.customer_name}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {item.booking.booking_services?.name || 'Service'}
                              {item.booking.person_count && item.booking.person_count > 1
                                ? ` · ${item.booking.person_count} people`
                                : ''}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">
                              {item.booking.customer_phone}
                            </p>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.bg} ${status.text}`}
                          >
                            {status.label}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-5 max-h-[70vh] overflow-y-auto">
            <div className="mb-4 sticky top-0 z-10 bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] pb-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Available appointments
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Choose a service and person count, then click a time to create a booking.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                Service
                <select
                  value={serviceId}
                  onChange={(e) => onServiceChange(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="">Select service</option>
                  {serviceOptions.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                {personCountLabel(selectedService)}
                <input
                  type="number"
                  min={1}
                  value={personCount}
                  onChange={(e) => onPersonCountChange(Number(e.target.value) || 1)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
                />
              </label>
            </div>

            {selectedService && (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
                <p>
                  Effective duration:{' '}
                  <span className="font-semibold text-slate-800">{effectiveDuration} min</span>
                </p>
                <p className="mt-1">
                  Buffer:{' '}
                  <span className="font-semibold text-slate-800">
                    {selectedService.buffer_minutes} min
                  </span>
                </p>
                <p className="mt-1">
                  Next appointment gap:{' '}
                  <span className="font-semibold text-slate-800">{nextStartGap} min</span>
                </p>
              </div>
            )}

            <div className="mt-4">
              {loadingSlots ? (
                <p className="text-sm text-slate-400">Loading slots...</p>
              ) : slotsError ? (
                <p className="text-sm text-amber-700">{slotsError}</p>
              ) : !serviceId ? (
                <p className="text-sm text-slate-400">Select a service to see available times.</p>
              ) : slots.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No available times for this day. Try another service, reduce person count, or
                  choose a different date.
                </p>
              ) : (
                <div className="max-h-[320px] overflow-y-auto pr-1">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {slots.map((slot) => (
                      <button
                        key={slot.isoString}
                        type="button"
                        onClick={() => onSelectSlot(slot)}
                        className="rounded-2xl border border-emerald-200 bg-white px-3 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-400 hover:bg-emerald-50 hover:shadow-md"
                      >
                        <span className="block text-base font-semibold text-slate-800">
                          {slot.time}
                        </span>
                        <span className="mt-1 block text-xs text-emerald-700">Create booking</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Week timeline view ──────────────────────────────────────────────────────

export const BookingRow = memo(function BookingRow({
  booking,
  onStatusChange,
  onEditBooking,
  onOpenHistory,
  onResendEmail,
  resendingBookingId,
  updatingId,
}: {
  booking: BookingWithService
  onStatusChange: (id: string, status: string) => void
  onEditBooking: (booking: BookingWithService) => void
  onOpenHistory: (bookingId: string) => void
  onResendEmail: (booking: BookingWithService) => void | Promise<void>
  resendingBookingId: string | null
  updatingId: string | null
}) {
  const status = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending
  const statusA11y = STATUS_ACCESSIBILITY[booking.status] ?? STATUS_ACCESSIBILITY.pending
  const sourceClass = SOURCE_CONFIG[booking.source] ?? 'bg-slate-100 text-slate-600'
  const isUpdating = updatingId === booking.id
  const isResending = resendingBookingId === booking.id

  return (
    <div className="px-4 sm:px-5 py-4 transition-all hover:bg-slate-50/80">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-16 flex-shrink-0">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm font-bold text-slate-700 tabular-nums shadow-sm">
            {formatTime(booking.start_time)}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-800 truncate">{booking.customer_name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-500">{booking.customer_phone}</span>
            {booking.booking_services && (
              <>
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-500">{booking.booking_services.name}</span>
                {booking.person_count && booking.person_count > 1 && (
                  <>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-medium text-indigo-600">
                      x{booking.person_count}
                    </span>
                  </>
                )}
                <span className="text-slate-300">·</span>
                <span className="text-xs text-slate-400">
                  {booking.booking_services.duration_minutes} min
                </span>
              </>
            )}
          </div>
          {booking.notes && (
            <p className="mt-2 line-clamp-2 text-xs text-slate-500">{booking.notes}</p>
          )}
          {booking.tags && booking.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {booking.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {booking.last_email_status && (
            <p className="mt-2 text-[11px] text-slate-400">
              Last email: {booking.last_email_status}
              {booking.last_email_sent_at
                ? ` · ${new Date(booking.last_email_sent_at).toLocaleString('en-GB')}`
                : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}
          >
            <span className="mr-1 inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/20 bg-white/60 px-1 text-[10px] font-bold leading-none">
              {statusA11y.short}
            </span>
            {status.label}
          </span>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${sourceClass} capitalize`}
          >
            {booking.source}
          </span>

          <button
            onClick={() => onEditBooking(booking)}
            className="ui-tap ui-focus inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            <PencilIcon className="h-3.5 w-3.5" />
            Edit
          </button>

          <button
            onClick={() => onOpenHistory(booking.id)}
            className="ui-tap ui-focus inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
          >
            History
          </button>

          <button
            onClick={() => void onResendEmail(booking)}
            disabled={isResending}
            className="ui-tap ui-focus inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
          >
            {isResending ? 'Sending…' : 'Re-send'}
          </button>

          {booking.status === BookingStatus.PENDING && (
            <button
              onClick={() => onStatusChange(booking.id, 'confirmed')}
              disabled={isUpdating}
              className="ui-tap ui-focus inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {!isUpdating && <CheckIcon className="h-3.5 w-3.5" />}
              {isUpdating ? '…' : 'Confirm'}
            </button>
          )}
          {booking.status === BookingStatus.CONFIRMED && (
            <button
              onClick={() => onStatusChange(booking.id, 'completed')}
              disabled={isUpdating}
              className="ui-tap ui-focus inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {!isUpdating && <DoneIcon className="h-3.5 w-3.5" />}
              {isUpdating ? '…' : 'Mark Done'}
            </button>
          )}
          {(booking.status === BookingStatus.PENDING ||
            booking.status === BookingStatus.CONFIRMED) && (
            <button
              onClick={() => onStatusChange(booking.id, 'cancelled')}
              disabled={isUpdating}
              className="ui-tap ui-focus inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {!isUpdating && <CloseIcon className="h-3.5 w-3.5" />}
              {isUpdating ? '…' : 'Cancel'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
})
