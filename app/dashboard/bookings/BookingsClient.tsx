'use client'

import { useState, useEffect, useCallback } from 'react'
import { BookingStatus, BookingSource } from '@/app/types/bookings'

interface BookingWithService {
  id: string
  customer_name: string
  customer_phone: string
  service_id: string
  start_time: string
  end_time: string
  status: BookingStatus
  source: BookingSource
  notes: string | null
  created_at: string
  booking_services: { name: string; duration_minutes: number } | null
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
  confirmed: { bg: 'bg-green-100',  text: 'text-green-800',  label: 'Confirmed' },
  completed: { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Completed' },
  cancelled: { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Cancelled' },
}
const SOURCE_CONFIG: Record<string, string> = {
  portal:    'bg-indigo-100 text-indigo-700',
  whatsapp:  'bg-green-100 text-green-700',
  website:   'bg-blue-100 text-blue-700',
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day + 1) // Start on Monday
  return d
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function formatHeaderDate(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function isSameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

export default function BookingsClient() {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today))
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [bookings, setBookings] = useState<BookingWithService[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [view, setView] = useState<'week' | 'list'>('week')

  // Build 7-day range for current week view
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(weekStart.getUTCDate() + i)
    return d
  })

  // Fetch bookings for the whole visible week
  const fetchBookings = useCallback(async () => {
    setLoading(true)
    const from = new Date(weekStart)
    const to = new Date(weekStart)
    to.setUTCDate(to.getUTCDate() + 7)

    try {
      const res = await fetch(
        `/api/bookings?from=${from.toISOString()}&to=${to.toISOString()}`
      )
      const json = await res.json()
      setBookings(json.bookings || [])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const goToPrevWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setUTCDate(d.getUTCDate() - 7)
      return d
    })
  }

  const goToNextWeek = () => {
    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setUTCDate(d.getUTCDate() + 7)
      return d
    })
  }

  const goToToday = () => {
    setWeekStart(startOfWeek(today))
    setSelectedDate(today)
  }

  const bookingsForDate = (date: Date) =>
    bookings.filter((b) => isSameUTCDay(new Date(b.start_time), date))

  const selectedBookings = bookingsForDate(selectedDate)

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: status as BookingStatus } : b))
      )
    } finally {
      setUpdatingId(null)
    }
  }

  // Stats for the week
  const totalWeek = bookings.filter((b) => b.status !== BookingStatus.CANCELLED).length
  const pendingWeek = bookings.filter((b) => b.status === BookingStatus.PENDING).length
  const confirmedWeek = bookings.filter((b) => b.status === BookingStatus.CONFIRMED).length

  const weekLabel = `${formatHeaderDate(weekStart)} — ${formatHeaderDate(weekDays[6])}`
  const isCurrentWeek = isSameUTCDay(weekStart, startOfWeek(today))

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
            <p className="text-sm text-slate-500 mt-0.5">{weekLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
              <button
                onClick={() => setView('week')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'week'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 text-sm font-medium border-l border-slate-200 transition-colors ${
                  view === 'list'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                List
              </button>
            </div>
            {/* Navigation */}
            <button
              onClick={goToPrevWeek}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              title="Previous week"
            >
              ←
            </button>
            {!isCurrentWeek && (
              <button
                onClick={goToToday}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Today
              </button>
            )}
            <button
              onClick={goToNextWeek}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              title="Next week"
            >
              →
            </button>
          </div>
        </div>

        {/* Week Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">This Week</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalWeek}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending</p>
            <p className="text-2xl font-bold text-yellow-500 mt-1">{pendingWeek}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Confirmed</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{confirmedWeek}</p>
          </div>
        </div>

        {/* ─── WEEK VIEW ─── */}
        {view === 'week' && (
          <div className="space-y-4">
            {/* 7-day strip */}
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const dayBookings = bookingsForDate(day)
                const isToday = isSameUTCDay(day, today)
                const isSelected = isSameUTCDay(day, selectedDate)
                const isPast = day < today && !isToday
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={`rounded-xl p-3 flex flex-col items-center gap-1 border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                        : isToday
                        ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                        : isPast
                        ? 'bg-white border-slate-100 text-slate-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                      {DAY_LABELS[day.getUTCDay()]}
                    </span>
                    <span className="text-lg font-bold leading-none">{day.getUTCDate()}</span>
                    {dayBookings.length > 0 && (
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                        isSelected ? 'bg-white text-indigo-600' : 'bg-indigo-100 text-indigo-600'
                      }`}>
                        {dayBookings.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected day panel */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">
                  {formatDateLabel(selectedDate)}
                  {isSameUTCDay(selectedDate, today) && (
                    <span className="ml-2 text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                      Today
                    </span>
                  )}
                </h2>
                <span className="text-sm text-slate-400">
                  {loading ? 'Loading…' : `${selectedBookings.length} appointment${selectedBookings.length !== 1 ? 's' : ''}`}
                </span>
              </div>

              {loading ? (
                <div className="py-12 text-center text-slate-400 text-sm">Loading appointments…</div>
              ) : selectedBookings.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-slate-400 text-sm">No appointments on this day</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {selectedBookings
                    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                    .map((booking) => (
                      <BookingRow
                        key={booking.id}
                        booking={booking}
                        onStatusChange={updateStatus}
                        updatingId={updatingId}
                      />
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── LIST VIEW ─── */}
        {view === 'list' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading appointments…</div>
            ) : bookings.filter((b) => b.status !== BookingStatus.CANCELLED).length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No appointments this week
              </div>
            ) : (
              weekDays.map((day) => {
                const dayBookings = bookingsForDate(day).filter(
                  (b) => b.status !== BookingStatus.CANCELLED
                )
                if (dayBookings.length === 0) return null
                const isToday = isSameUTCDay(day, today)
                return (
                  <div key={day.toISOString()}>
                    <div className={`px-5 py-3 border-b border-slate-100 flex items-center gap-2 ${isToday ? 'bg-indigo-50' : 'bg-slate-50'}`}>
                      <span className={`text-sm font-semibold ${isToday ? 'text-indigo-700' : 'text-slate-600'}`}>
                        {formatDateLabel(day)}
                      </span>
                      {isToday && (
                        <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">Today</span>
                      )}
                      <span className="ml-auto text-xs text-slate-400">{dayBookings.length} appointment{dayBookings.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {dayBookings
                        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                        .map((booking) => (
                          <BookingRow
                            key={booking.id}
                            booking={booking}
                            onStatusChange={updateStatus}
                            updatingId={updatingId}
                          />
                        ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Shared Booking Row ───
function BookingRow({
  booking,
  onStatusChange,
  updatingId,
}: {
  booking: BookingWithService
  onStatusChange: (id: string, status: string) => void
  updatingId: string | null
}) {
  const status = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending
  const sourceClass = SOURCE_CONFIG[booking.source] ?? 'bg-slate-100 text-slate-600'
  const isUpdating = updatingId === booking.id

  return (
    <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
      {/* Time */}
      <div className="w-14 flex-shrink-0 text-sm font-bold text-slate-700 tabular-nums">
        {formatTime(booking.start_time)}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 truncate">{booking.customer_name}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-slate-500">{booking.customer_phone}</span>
          {booking.booking_services && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-500">{booking.booking_services.name}</span>
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-400">{booking.booking_services.duration_minutes} min</span>
            </>
          )}
        </div>
      </div>

      {/* Badges + Actions */}
      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}>
          {status.label}
        </span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sourceClass} capitalize`}>
          {booking.source}
        </span>

        {/* Status Action Buttons */}
        {booking.status === BookingStatus.PENDING && (
          <button
            onClick={() => onStatusChange(booking.id, 'confirmed')}
            disabled={isUpdating}
            className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isUpdating ? '…' : 'Confirm'}
          </button>
        )}
        {booking.status === BookingStatus.CONFIRMED && (
          <button
            onClick={() => onStatusChange(booking.id, 'completed')}
            disabled={isUpdating}
            className="text-xs font-medium px-2.5 py-1 rounded-full bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {isUpdating ? '…' : 'Mark Done'}
          </button>
        )}
        {(booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED) && (
          <button
            onClick={() => onStatusChange(booking.id, 'cancelled')}
            disabled={isUpdating}
            className="text-xs font-medium px-2.5 py-1 rounded-full border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            {isUpdating ? '…' : 'Cancel'}
          </button>
        )}
      </div>
    </div>
  )
}
