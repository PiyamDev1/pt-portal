'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { BookingStatus, BookingSource } from '@/app/types/bookings'
import BookingSettingsTab, {
  type BranchLocationOption,
} from '@/app/dashboard/settings/components/BookingSettingsTab'

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
const CALENDAR_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Confirmed' },
  completed: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Completed' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
}

const SOURCE_CONFIG: Record<string, string> = {
  portal: 'bg-indigo-100 text-indigo-700',
  whatsapp: 'bg-green-100 text-green-700',
  website: 'bg-blue-100 text-blue-700',
}

function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day + 1) // Monday start
  return d
}

function startOfMonth(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(1)
  return d
}

function startOfCalendarGrid(monthStart: Date): Date {
  const start = startOfWeek(monthStart)
  if (start.getUTCMonth() === monthStart.getUTCMonth() && start.getUTCDate() === 1) {
    return start
  }
  return start
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

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', {
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

function statusDotClass(status: BookingStatus): string {
  switch (status) {
    case BookingStatus.CONFIRMED:
      return 'bg-green-500'
    case BookingStatus.PENDING:
      return 'bg-yellow-400'
    case BookingStatus.COMPLETED:
      return 'bg-slate-400'
    case BookingStatus.CANCELLED:
      return 'bg-red-400'
    default:
      return 'bg-slate-300'
  }
}

interface BookingsClientProps {
  isAdmin: boolean
  userLocationId: string | null
  branchLocations: BranchLocationOption[]
}

export default function BookingsClient({
  isAdmin,
  userLocationId,
  branchLocations,
}: BookingsClientProps) {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [view, setView] = useState<'week' | 'list' | 'multi'>('multi')
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today))
  const [monthStart, setMonthStart] = useState<Date>(() => startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState<Date>(today)

  const [bookings, setBookings] = useState<BookingWithService[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    userLocationId || branchLocations[0]?.id || ''
  )

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(weekStart.getUTCDate() + i)
    return d
  })

  const calendarGridStart = useMemo(() => startOfCalendarGrid(monthStart), [monthStart])
  const calendarDays = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const d = new Date(calendarGridStart)
    d.setUTCDate(calendarGridStart.getUTCDate() + i)
    return d
  }), [calendarGridStart])

  const rangeStart = useMemo(
    () => (view === 'multi' ? new Date(calendarGridStart) : new Date(weekStart)),
    [view, calendarGridStart, weekStart]
  )
  const rangeEnd = useMemo(() => {
    const to = new Date(rangeStart)
    to.setUTCDate(to.getUTCDate() + (view === 'multi' ? 42 : 7))
    return to
  }, [rangeStart, view])

  const fromISO = useMemo(() => rangeStart.toISOString(), [rangeStart])
  const toISO = useMemo(() => rangeEnd.toISOString(), [rangeEnd])

  const fetchBookings = useCallback(async (background = false) => {
    if (background) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const params = new URLSearchParams({ from: fromISO, to: toISO })
      if (selectedLocationId) {
        params.set('location_id', selectedLocationId)
      }

      const res = await fetch(`/api/bookings?${params.toString()}`, { cache: 'no-store' })
      const json = await res.json()
      setBookings(json.bookings || [])
      setLastUpdatedAt(new Date())
    } catch {
      setBookings([])
    } finally {
      if (background) {
        setRefreshing(false)
      } else {
        setLoading(false)
      }
    }
  }, [fromISO, toISO, selectedLocationId])

  useEffect(() => {
    fetchBookings(false)
  }, [fetchBookings])

  useEffect(() => {
    if (showSettings) return

    if (!autoRefresh) return

    const intervalId = setInterval(() => {
      fetchBookings(true)
    }, 10000)

    const onFocus = () => fetchBookings(true)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchBookings(true)
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [autoRefresh, fetchBookings, showSettings])

  const goToPrev = () => {
    if (view === 'multi') {
      setMonthStart((prev) => {
        const d = new Date(prev)
        d.setUTCMonth(d.getUTCMonth() - 1)
        return d
      })
      return
    }

    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setUTCDate(d.getUTCDate() - 7)
      return d
    })
  }

  const goToNext = () => {
    if (view === 'multi') {
      setMonthStart((prev) => {
        const d = new Date(prev)
        d.setUTCMonth(d.getUTCMonth() + 1)
        return d
      })
      return
    }

    setWeekStart((prev) => {
      const d = new Date(prev)
      d.setUTCDate(d.getUTCDate() + 7)
      return d
    })
  }

  const goToToday = () => {
    setSelectedDate(today)
    setWeekStart(startOfWeek(today))
    setMonthStart(startOfMonth(today))
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

  const totalVisible = bookings.filter((b) => b.status !== BookingStatus.CANCELLED).length
  const pendingVisible = bookings.filter((b) => b.status === BookingStatus.PENDING).length
  const confirmedVisible = bookings.filter((b) => b.status === BookingStatus.CONFIRMED).length

  const weekLabel = `${formatHeaderDate(weekStart)} — ${formatHeaderDate(weekDays[6])}`
  const monthLabel = formatMonthLabel(monthStart)

  const isCurrentPeriod =
    view === 'multi'
      ? monthStart.getUTCFullYear() === today.getUTCFullYear() &&
        monthStart.getUTCMonth() === today.getUTCMonth()
      : isSameUTCDay(weekStart, startOfWeek(today))

  const selectedDateCount = selectedBookings.length
  const refreshLabel = lastUpdatedAt
    ? lastUpdatedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : 'Never'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
            <p className="text-sm text-slate-500 mt-0.5">{view === 'multi' ? monthLabel : weekLabel}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded-lg border border-slate-200 overflow-hidden bg-white">
              <button
                onClick={() => setView('multi')}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === 'multi' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Calendar
              </button>
              <button
                onClick={() => setView('week')}
                className={`px-3 py-1.5 text-sm font-medium border-l border-slate-200 transition-colors ${
                  view === 'week' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 text-sm font-medium border-l border-slate-200 transition-colors ${
                  view === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                List
              </button>
            </div>

            <button
              onClick={goToPrev}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              title={view === 'multi' ? 'Previous month' : 'Previous week'}
            >
              ←
            </button>

            {!isCurrentPeriod && (
              <button
                onClick={goToToday}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Today
              </button>
            )}

            <button
              onClick={goToNext}
              className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
              title={view === 'multi' ? 'Next month' : 'Next week'}
            >
              →
            </button>

            <button
              onClick={() => fetchBookings(true)}
              disabled={refreshing}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-600">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              Auto refresh (10s)
            </label>

            {isAdmin && (
              <button
                onClick={() => setShowSettings((prev) => !prev)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                  showSettings
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {showSettings ? 'Back to Appointments' : 'Booking Settings'}
              </button>
            )}

            {isAdmin && !showSettings && branchLocations.length > 0 && (
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700"
              >
                {branchLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}{location.branch_code ? ` (${location.branch_code})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span>Last updated: {refreshLabel}</span>
          {refreshing && <span className="text-indigo-600">Checking for changes...</span>}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Visible Range</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{totalVisible}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending</p>
            <p className="text-2xl font-bold text-yellow-500 mt-1">{pendingVisible}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Confirmed</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{confirmedVisible}</p>
          </div>
        </div>

        {showSettings && isAdmin ? (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <BookingSettingsTab
              branchLocations={branchLocations}
              selectedLocationId={selectedLocationId}
              onLocationChange={setSelectedLocationId}
            />
          </div>
        ) : view === 'multi' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
                {CALENDAR_DAY_LABELS.map((label) => (
                  <div key={label} className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">
                    {label}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarDays.map((day) => {
                  const dayBookings = bookingsForDate(day)
                  const isToday = isSameUTCDay(day, today)
                  const isSelected = isSameUTCDay(day, selectedDate)
                  const isOutsideMonth = day.getUTCMonth() !== monthStart.getUTCMonth()

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => {
                        setSelectedDate(day)
                        setWeekStart(startOfWeek(day))
                      }}
                      className={`min-h-[108px] p-2 border-r border-b border-slate-100 text-left transition-colors ${
                        isSelected
                          ? 'bg-indigo-50'
                          : isToday
                          ? 'bg-blue-50'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-sm font-semibold ${
                            isSelected
                              ? 'text-indigo-700'
                              : isToday
                              ? 'text-blue-700'
                              : isOutsideMonth
                              ? 'text-slate-300'
                              : 'text-slate-700'
                          }`}
                        >
                          {day.getUTCDate()}
                        </span>
                        {dayBookings.length > 0 && (
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {dayBookings.length}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 space-y-1">
                        {dayBookings.slice(0, 3).map((booking) => (
                          <div key={booking.id} className="flex items-center gap-1.5">
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(booking.status)}`} />
                            <span className="text-[11px] text-slate-500 truncate">
                              {formatTime(booking.start_time)} {booking.customer_name}
                            </span>
                          </div>
                        ))}
                        {dayBookings.length > 3 && (
                          <p className="text-[11px] text-slate-400">+{dayBookings.length - 3} more</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <SelectedDayPanel
              selectedDate={selectedDate}
              today={today}
              selectedBookings={selectedBookings}
              loading={loading}
              updatingId={updatingId}
              onStatusChange={updateStatus}
              selectedDateCount={selectedDateCount}
            />
          </div>
        )}

        {view === 'week' && (
          <div className="space-y-4">
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

            <SelectedDayPanel
              selectedDate={selectedDate}
              today={today}
              selectedBookings={selectedBookings}
              loading={loading}
              updatingId={updatingId}
              onStatusChange={updateStatus}
              selectedDateCount={selectedDateCount}
            />
          </div>
        )}

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

function SelectedDayPanel({
  selectedDate,
  today,
  selectedBookings,
  loading,
  updatingId,
  onStatusChange,
  selectedDateCount,
}: {
  selectedDate: Date
  today: Date
  selectedBookings: BookingWithService[]
  loading: boolean
  updatingId: string | null
  onStatusChange: (id: string, status: string) => void
  selectedDateCount: number
}) {
  return (
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
          {loading ? 'Loading…' : `${selectedDateCount} appointment${selectedDateCount !== 1 ? 's' : ''}`}
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
                onStatusChange={onStatusChange}
                updatingId={updatingId}
              />
            ))}
        </div>
      )}
    </div>
  )
}

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
      <div className="w-14 flex-shrink-0 text-sm font-bold text-slate-700 tabular-nums">
        {formatTime(booking.start_time)}
      </div>

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

      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}>
          {status.label}
        </span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sourceClass} capitalize`}>
          {booking.source}
        </span>

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
