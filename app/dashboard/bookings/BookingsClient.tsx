'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { BookingStatus, BookingSource } from '@/app/types/bookings'
import BookingSettingsTab, {
  type BranchLocationOption,
} from '@/app/dashboard/settings/components/BookingSettingsTab'

interface BookingWithService {
  id: string
  customer_name: string
  customer_phone: string
  customer_email: string
  service_id: string
  person_count?: number
  start_time: string
  end_time: string
  status: BookingStatus
  source: BookingSource
  notes: string | null
  created_at: string
  booking_services: { name: string; duration_minutes: number } | null
}

interface BookingServiceOption {
  id: string
  name: string
  is_active: boolean
  duration_minutes: number
  buffer_minutes: number
  duration_per_additional_person_minutes: number
}

interface SlotOption {
  time: string
  isoString: string
}

interface SlotLoadResult {
  slots: SlotOption[]
  error: string | null
}

const COUNTRY_CODE_OPTIONS = [
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+1', label: 'United States (+1)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+92', label: 'Pakistan (+92)' },
  { code: '+91', label: 'India (+91)' },
  { code: '+880', label: 'Bangladesh (+880)' },
]

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

function isValidLocalPhone(phone: string): boolean {
  const normalized = phone.replace(/[^\d]/g, '')
  return normalized.length >= 6 && normalized.length <= 14
}

function normalizeLocalPhone(phone: string): string {
  return phone.replace(/[^\d]/g, '')
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

function formatLongDateLabel(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
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
  const [serviceOptions, setServiceOptions] = useState<BookingServiceOption[]>([])
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [editingBooking, setEditingBooking] = useState<BookingWithService | null>(null)
  const [savingBooking, setSavingBooking] = useState(false)
  const [availableSlots, setAvailableSlots] = useState<SlotOption[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [showDayAgendaModal, setShowDayAgendaModal] = useState(false)
  const [dayAgendaServiceId, setDayAgendaServiceId] = useState('')
  const [dayAgendaPersonCount, setDayAgendaPersonCount] = useState(1)
  const [dayAgendaSlots, setDayAgendaSlots] = useState<SlotOption[]>([])
  const [loadingDayAgendaSlots, setLoadingDayAgendaSlots] = useState(false)
  const [dayAgendaSlotsError, setDayAgendaSlotsError] = useState<string | null>(null)
  const [appointmentForm, setAppointmentForm] = useState({
    customer_name: '',
    customer_email: '',
    phone_country_code: '+44',
    phone_local: '',
    service_id: '',
    date: '',
    start_time: '',
    person_count: 1,
  })

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
  const selectedDateKey = useMemo(() => selectedDate.toISOString().slice(0, 10), [selectedDate])

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
      if (res.status === 429) {
        setAutoRefresh(false)
        setLastUpdatedAt(new Date())
        return
      }
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

  const fetchServices = useCallback(async () => {
    if (!selectedLocationId) return
    try {
      const res = await fetch(`/api/bookings/settings/services?location_id=${selectedLocationId}`)
      const json = await res.json()
      if (!res.ok) return
      setServiceOptions((json.services || []).filter((s: BookingServiceOption) => s.is_active))
    } catch {
      setServiceOptions([])
    }
  }, [selectedLocationId])

  useEffect(() => {
    fetchBookings(false)
  }, [fetchBookings])

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  useEffect(() => {
    if (!showSettings) {
      fetchServices()
    }
  }, [showSettings, fetchServices])

  useEffect(() => {
    if (showSettings) return

    if (!autoRefresh) return

    const intervalId = setInterval(() => {
      fetchBookings(true)
    }, 120000)

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

  const loadSlotsFor = useCallback(async (date: string, serviceId: string, personCount: number): Promise<SlotLoadResult> => {
    if (!date || !serviceId || !selectedLocationId) {
      return { slots: [], error: null }
    }

    try {
      const params = new URLSearchParams({
        date,
        service_id: serviceId,
        location_id: selectedLocationId,
        person_count: String(personCount),
      })
      const res = await fetch(`/api/bookings/available-slots?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) {
        return { slots: [], error: json.error || 'Failed to load available slots' }
      }
      return {
        slots: (json.slots || []) as SlotOption[],
        error: json.error || json.message || json.warning || null,
      }
    } catch {
      return { slots: [], error: 'Failed to load available slots' }
    }
  }, [selectedLocationId])

  const openCreateAppointment = useCallback((options?: {
    date?: string
    service_id?: string
    person_count?: number
    start_time?: string
  }) => {
    setEditingBooking(null)
    setSlotsError(null)
    setAvailableSlots([])
    setShowDayAgendaModal(false)
    setAppointmentForm({
      customer_name: '',
      customer_email: '',
      phone_country_code: '+44',
      phone_local: '',
      service_id: options?.service_id ?? serviceOptions[0]?.id ?? '',
      date: options?.date ?? selectedDateKey,
      start_time: options?.start_time ?? '',
      person_count: options?.person_count ?? 1,
    })
    setShowAppointmentModal(true)
  }, [selectedDateKey, serviceOptions])

  const openDayAgenda = useCallback((day: Date) => {
    setSelectedDate(day)
    setWeekStart(startOfWeek(day))
    setDayAgendaServiceId((current) => current || appointmentForm.service_id || serviceOptions[0]?.id || '')
    setDayAgendaPersonCount(appointmentForm.person_count || 1)
    setDayAgendaSlots([])
    setDayAgendaSlotsError(null)
    setShowDayAgendaModal(true)
  }, [appointmentForm.person_count, appointmentForm.service_id, serviceOptions])

  const activeBookings = bookings.filter((b) => b.status !== BookingStatus.CANCELLED)
  const cancelledBookings = bookings.filter((b) => b.status === BookingStatus.CANCELLED)

  const bookingsForDate = (date: Date) =>
    activeBookings.filter((b) => isSameUTCDay(new Date(b.start_time), date))

  const selectedBookings = bookingsForDate(selectedDate)

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to update appointment')
        return
      }
      if (json.email_warning) {
        toast.warning(`Appointment updated but email warning: ${json.email_warning}`)
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status: status as BookingStatus } : b))
      )
    } finally {
      setUpdatingId(null)
    }
  }

  const openEditBooking = (booking: BookingWithService) => {
    const matchedCode = COUNTRY_CODE_OPTIONS.find((c) => booking.customer_phone.startsWith(c.code))
    const code = matchedCode?.code || '+44'
    const local = booking.customer_phone.startsWith(code)
      ? booking.customer_phone.slice(code.length).trim()
      : booking.customer_phone

    setEditingBooking(booking)
    setSlotsError(null)
    setShowDayAgendaModal(false)
    setAppointmentForm({
      customer_name: booking.customer_name,
      customer_email: booking.customer_email || '',
      phone_country_code: code,
      phone_local: local,
      service_id: booking.service_id,
      date: booking.start_time.slice(0, 10),
      start_time: booking.start_time,
      person_count: booking.person_count ?? 1,
    })
    setShowAppointmentModal(true)
  }

  const fetchAvailableSlots = useCallback(async () => {
    if (!showAppointmentModal || !appointmentForm.date || !appointmentForm.service_id || !selectedLocationId) {
      setAvailableSlots([])
      setSlotsError(null)
      return
    }

    setLoadingSlots(true)
    try {
      const result = await loadSlotsFor(
        appointmentForm.date,
        appointmentForm.service_id,
        appointmentForm.person_count
      )
      setAvailableSlots(result.slots)
      setSlotsError(result.error)
    } finally {
      setLoadingSlots(false)
    }
  }, [appointmentForm.date, appointmentForm.person_count, appointmentForm.service_id, loadSlotsFor, selectedLocationId, showAppointmentModal])

  useEffect(() => {
    fetchAvailableSlots()
  }, [fetchAvailableSlots])

  useEffect(() => {
    if (!showDayAgendaModal) return
    if (!dayAgendaServiceId && serviceOptions.length > 0) {
      setDayAgendaServiceId(serviceOptions[0].id)
    }
  }, [dayAgendaServiceId, serviceOptions, showDayAgendaModal])

  useEffect(() => {
    if (!showDayAgendaModal) return
    if (!selectedDateKey || !dayAgendaServiceId || !selectedLocationId) {
      setDayAgendaSlots([])
      setDayAgendaSlotsError(null)
      return
    }

    let cancelled = false

    const run = async () => {
      setLoadingDayAgendaSlots(true)
      const result = await loadSlotsFor(selectedDateKey, dayAgendaServiceId, dayAgendaPersonCount)
      if (cancelled) return
      setDayAgendaSlots(result.slots)
      setDayAgendaSlotsError(result.error)
      setLoadingDayAgendaSlots(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [dayAgendaPersonCount, dayAgendaServiceId, loadSlotsFor, selectedDateKey, selectedLocationId, showDayAgendaModal])

  useEffect(() => {
    if (!showAppointmentModal || loadingSlots) return
    if (availableSlots.length === 0) {
      if (appointmentForm.start_time) {
        setAppointmentForm((prev) => ({ ...prev, start_time: '' }))
      }
      return
    }

    const hasCurrentSelection = availableSlots.some((slot) => slot.isoString === appointmentForm.start_time)
    if (hasCurrentSelection) return

    if (editingBooking) {
      const stillAvailable = availableSlots.find((slot) => slot.isoString === editingBooking.start_time)
      if (stillAvailable) {
        setAppointmentForm((prev) => ({ ...prev, start_time: stillAvailable.isoString }))
        return
      }
    }

    setAppointmentForm((prev) => ({ ...prev, start_time: availableSlots[0].isoString }))
  }, [availableSlots, appointmentForm.start_time, editingBooking, loadingSlots, showAppointmentModal])

  const saveAppointment = async () => {
    if (!selectedLocationId) return

    if (!appointmentForm.customer_name || !appointmentForm.customer_email || !appointmentForm.phone_local || !appointmentForm.service_id || !appointmentForm.start_time) {
      toast.error('Fill in all appointment fields')
      return
    }

    if (!isValidLocalPhone(appointmentForm.phone_local)) {
      toast.error('Phone number must contain between 6 and 14 digits')
      return
    }

    setSavingBooking(true)
    try {
      const customer_phone = `${appointmentForm.phone_country_code} ${normalizeLocalPhone(appointmentForm.phone_local)}`.trim()

      if (editingBooking) {
        const res = await fetch(`/api/bookings/${editingBooking.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: appointmentForm.customer_name,
            customer_phone,
            customer_email: appointmentForm.customer_email,
            service_id: appointmentForm.service_id,
            start_time: appointmentForm.start_time,
            person_count: appointmentForm.person_count,
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          toast.error(json.error || 'Failed to update appointment')
          return
        }
        if (json.email_warning) {
          toast.warning(`Appointment updated but email warning: ${json.email_warning}`)
        } else {
          toast.success('Appointment updated')
        }
      } else {
        const res = await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location_id: selectedLocationId,
            customer_name: appointmentForm.customer_name,
            customer_phone,
            customer_email: appointmentForm.customer_email,
            service_id: appointmentForm.service_id,
            start_time: appointmentForm.start_time,
            person_count: appointmentForm.person_count,
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          toast.error(json.error || 'Failed to create appointment')
          return
        }
        if (json.email_warning) {
          toast.warning(`Appointment created but email warning: ${json.email_warning}`)
        } else {
          toast.success('Appointment created')
        }
      }

      setShowAppointmentModal(false)
      setEditingBooking(null)
      setSlotsError(null)
      setAvailableSlots([])
      await fetchBookings(false)
    } finally {
      setSavingBooking(false)
    }
  }

  const cancelEditingBooking = async () => {
    if (!editingBooking) return
    await updateStatus(editingBooking.id, BookingStatus.CANCELLED)
    setShowAppointmentModal(false)
    setEditingBooking(null)
  }

  const totalVisible = activeBookings.length
  const pendingVisible = activeBookings.filter((b) => b.status === BookingStatus.PENDING).length
  const confirmedVisible = activeBookings.filter((b) => b.status === BookingStatus.CONFIRMED).length
  const invalidLocalPhone = appointmentForm.phone_local.length > 0 && !isValidLocalPhone(appointmentForm.phone_local)

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
              Auto refresh (120s)
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

            {!showSettings && (
              <button
                onClick={() => openCreateAppointment()}
                className="px-3 py-2 rounded-lg border border-indigo-600 bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + Add Appointment
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
                      onClick={() => openDayAgenda(day)}
                      className={`min-h-[108px] p-2 border-r border-b border-slate-100 text-left transition-colors ${
                        isSelected
                          ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300'
                          : isToday
                          ? 'bg-amber-50 ring-2 ring-inset ring-amber-300'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-semibold ${
                              isSelected
                                ? 'text-indigo-700'
                                : isToday
                                ? 'text-amber-700'
                                : isOutsideMonth
                                ? 'text-slate-300'
                                : 'text-slate-700'
                            }`}
                          >
                            {day.getUTCDate()}
                          </span>
                          {isToday && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              Today
                            </span>
                          )}
                        </div>
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
              onEditBooking={openEditBooking}
              selectedDateCount={selectedDateCount}
              onOpenDayAgenda={() => openDayAgenda(selectedDate)}
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
                    onClick={() => openDayAgenda(day)}
                    className={`rounded-xl p-3 flex flex-col items-center gap-1 border transition-all ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                        : isToday
                        ? 'bg-amber-50 border-amber-300 text-amber-800 ring-2 ring-amber-200'
                        : isPast
                        ? 'bg-white border-slate-100 text-slate-400'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                    }`}
                  >
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isSelected ? 'text-indigo-200' : isToday ? 'text-amber-600' : 'text-slate-400'}`}>
                      {DAY_LABELS[day.getUTCDay()]}
                    </span>
                    <span className="text-lg font-bold leading-none">{day.getUTCDate()}</span>
                    {isToday && !isSelected && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Today
                      </span>
                    )}
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
              onEditBooking={openEditBooking}
              selectedDateCount={selectedDateCount}
              onOpenDayAgenda={() => openDayAgenda(selectedDate)}
            />
          </div>
        )}

        {view === 'list' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading appointments…</div>
            ) : activeBookings.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                No appointments this week
              </div>
            ) : (
              weekDays.map((day) => {
                const dayBookings = bookingsForDate(day)
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
                            onEditBooking={openEditBooking}
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

        {!showSettings && cancelledBookings.length > 0 && (
          <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-red-100 bg-red-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-700">Cancelled Appointment Logs</h3>
              <span className="text-xs text-red-600">{cancelledBookings.length} cancelled</span>
            </div>
            <div className="divide-y divide-red-50 max-h-72 overflow-y-auto">
              {cancelledBookings
                .slice()
                .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                .map((booking) => (
                  <div key={booking.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {formatDateLabel(new Date(booking.start_time))} {formatTime(booking.start_time)} · {booking.customer_name}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {booking.booking_services?.name || 'Service'} · {booking.customer_phone}
                      </p>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-red-100 text-red-700">Cancelled</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {showAppointmentModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-slate-200 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">
                {editingBooking ? 'Modify Appointment' : 'Add Appointment'}
              </h2>
              <button onClick={() => setShowAppointmentModal(false)} className="text-sm text-slate-500 hover:text-slate-700">Close</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm text-slate-700">
                Name
                <input value={appointmentForm.customer_name} onChange={(e) => setAppointmentForm((p) => ({ ...p, customer_name: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
              </label>

              <label className="text-sm text-slate-700">
                Email address
                <input type="email" value={appointmentForm.customer_email} onChange={(e) => setAppointmentForm((p) => ({ ...p, customer_email: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
              </label>

              <label className="text-sm text-slate-700">
                Country code
                <select value={appointmentForm.phone_country_code} onChange={(e) => setAppointmentForm((p) => ({ ...p, phone_country_code: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2">
                  {COUNTRY_CODE_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                Phone number
                <input value={appointmentForm.phone_local} onChange={(e) => setAppointmentForm((p) => ({ ...p, phone_local: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
                {invalidLocalPhone && <p className="mt-1 text-xs text-red-600">Enter 6-14 digits (spaces and dashes are allowed).</p>}
              </label>

              <label className="text-sm text-slate-700">
                Service
                <select value={appointmentForm.service_id} onChange={(e) => setAppointmentForm((p) => ({ ...p, service_id: e.target.value, start_time: '', person_count: 1 }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2">
                  <option value="">Select service</option>
                  {serviceOptions.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                Date
                <input type="date" value={appointmentForm.date} onChange={(e) => setAppointmentForm((p) => ({ ...p, date: e.target.value, start_time: '' }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
              </label>
            </div>

            {(() => {
              const selectedService = serviceOptions.find((s) => s.id === appointmentForm.service_id)
              const effectiveDuration = selectedService
                ? selectedService.duration_minutes + Math.max(0, appointmentForm.person_count - 1) * selectedService.duration_per_additional_person_minutes
                : null
              const nextStartGap = selectedService
                ? effectiveDuration! + Math.max(0, selectedService.buffer_minutes)
                : null

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm text-slate-700">
                    Number of persons
                    <input
                      type="number"
                      min={1}
                      value={appointmentForm.person_count}
                      onChange={(e) => {
                        const value = Math.max(1, Number(e.target.value) || 1)
                        setAppointmentForm((p) => ({ ...p, person_count: value, start_time: '' }))
                      }}
                      className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
                    />
                  </label>

                  {selectedService && (
                    <div className="text-xs text-slate-600 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                      <p>Effective duration: <span className="font-semibold">{effectiveDuration} min</span></p>
                      <p className="mt-1">Buffer: <span className="font-semibold">{selectedService.buffer_minutes} min</span></p>
                      <p className="mt-1">Next appointment gap: <span className="font-semibold">{nextStartGap} min</span></p>
                    </div>
                  )}
                </div>
              )
            })()}

            <div className="text-sm text-slate-700">
              <span className="block mb-1 font-medium">Available start times</span>
              {loadingSlots ? (
                <p className="text-slate-400 text-sm">Loading slots...</p>
              ) : slotsError ? (
                <p className="text-amber-700 text-sm">{slotsError}</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-slate-400 text-sm">{appointmentForm.date && appointmentForm.service_id ? 'No slots available for this date.' : 'Select a service and date.'}</p>
              ) : (
                <div className="flex gap-2 flex-wrap mt-1">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.isoString}
                      type="button"
                      onClick={() => setAppointmentForm((p) => ({ ...p, start_time: slot.isoString }))}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                        appointmentForm.start_time === slot.isoString
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              )}
              {editingBooking && <p className="mt-1 text-xs text-slate-500">Current booking time is preselected when available. Choose a different slot to modify.</p>}
            </div>

            <div className="flex items-center justify-end gap-2">
              {editingBooking && (editingBooking.status === BookingStatus.PENDING || editingBooking.status === BookingStatus.CONFIRMED) && (
                <button onClick={cancelEditingBooking} disabled={savingBooking || updatingId === editingBooking.id} className="px-4 py-2 rounded border border-red-200 bg-red-50 text-sm text-red-600 disabled:opacity-50">
                  {updatingId === editingBooking.id ? 'Cancelling...' : 'Cancel Appointment'}
                </button>
              )}
              <button onClick={() => setShowAppointmentModal(false)} className="px-4 py-2 rounded border border-slate-300 text-sm">Cancel</button>
              <button onClick={saveAppointment} disabled={savingBooking || invalidLocalPhone} className="px-4 py-2 rounded bg-indigo-600 text-white text-sm disabled:opacity-50">
                {savingBooking ? 'Saving...' : editingBooking ? 'Save Changes' : 'Create Appointment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDayAgendaModal && (
        <DayAgendaModal
          selectedDate={selectedDate}
          today={today}
          bookings={selectedBookings}
          serviceOptions={serviceOptions}
          serviceId={dayAgendaServiceId}
          personCount={dayAgendaPersonCount}
          loadingSlots={loadingDayAgendaSlots}
          slots={dayAgendaSlots}
          slotsError={dayAgendaSlotsError}
          onClose={() => setShowDayAgendaModal(false)}
          onServiceChange={setDayAgendaServiceId}
          onPersonCountChange={(value) => setDayAgendaPersonCount(Math.max(1, value))}
          onSelectSlot={(slot) => openCreateAppointment({
            date: selectedDateKey,
            service_id: dayAgendaServiceId,
            person_count: dayAgendaPersonCount,
            start_time: slot.isoString,
          })}
          onSelectBooking={openEditBooking}
        />
      )}
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
  onEditBooking,
  selectedDateCount,
  onOpenDayAgenda,
}: {
  selectedDate: Date
  today: Date
  selectedBookings: BookingWithService[]
  loading: boolean
  updatingId: string | null
  onStatusChange: (id: string, status: string) => void
  onEditBooking: (booking: BookingWithService) => void
  selectedDateCount: number
  onOpenDayAgenda: () => void
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
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
                onEditBooking={onEditBooking}
                updatingId={updatingId}
              />
            ))}
        </div>
      )}
    </div>
  )
}

function DayAgendaModal({
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
    ? selectedService.duration_minutes + Math.max(0, personCount - 1) * selectedService.duration_per_additional_person_minutes
    : null
  const nextStartGap = selectedService
    ? effectiveDuration! + Math.max(0, selectedService.buffer_minutes)
    : null

  return (
    <div className="fixed inset-0 z-40 bg-slate-950/45 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{formatLongDateLabel(selectedDate)}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {bookings.length} booked appointment{bookings.length !== 1 ? 's' : ''}
              {isSameUTCDay(selectedDate, today) ? ' · Today' : ''}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
            Close
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="border-r border-slate-200 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Booked appointments</h3>
              <span className="text-xs text-slate-400">Click a booking to modify or cancel</span>
            </div>
            {bookings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                No appointments booked for this day.
              </div>
            ) : (
              <div className="space-y-3">
                {bookings
                  .slice()
                  .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
                  .map((booking) => {
                    const status = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.pending
                    return (
                      <button
                        key={booking.id}
                        type="button"
                        onClick={() => onSelectBooking(booking)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-slate-800">{formatTime(booking.start_time)} · {booking.customer_name}</p>
                            <p className="mt-1 text-sm text-slate-500">
                              {booking.booking_services?.name || 'Service'}
                              {booking.person_count && booking.person_count > 1 ? ` · ${booking.person_count} people` : ''}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">{booking.customer_phone}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.bg} ${status.text}`}>
                            {status.label}
                          </span>
                        </div>
                      </button>
                    )
                  })}
              </div>
            )}
          </div>

          <div className="bg-slate-50 p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Available appointments</h3>
              <p className="mt-1 text-xs text-slate-400">Choose a service and person count, then click a time to create a booking.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm text-slate-700">
                Service
                <select value={serviceId} onChange={(e) => onServiceChange(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                  <option value="">Select service</option>
                  {serviceOptions.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </label>

              <label className="text-sm text-slate-700">
                Number of persons
                <input type="number" min={1} value={personCount} onChange={(e) => onPersonCountChange(Number(e.target.value) || 1)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
              </label>
            </div>

            {selectedService && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600">
                <p>Effective duration: <span className="font-semibold text-slate-800">{effectiveDuration} min</span></p>
                <p className="mt-1">Buffer: <span className="font-semibold text-slate-800">{selectedService.buffer_minutes} min</span></p>
                <p className="mt-1">Next appointment gap: <span className="font-semibold text-slate-800">{nextStartGap} min</span></p>
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
                <p className="text-sm text-slate-400">No available times for this day.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {slots.map((slot) => (
                    <button
                      key={slot.isoString}
                      type="button"
                      onClick={() => onSelectSlot(slot)}
                      className="rounded-xl border border-emerald-200 bg-white px-3 py-3 text-left hover:border-emerald-400 hover:bg-emerald-50"
                    >
                      <span className="block text-base font-semibold text-slate-800">{slot.time}</span>
                      <span className="mt-1 block text-xs text-emerald-700">Create booking</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BookingRow({
  booking,
  onStatusChange,
  onEditBooking,
  updatingId,
}: {
  booking: BookingWithService
  onStatusChange: (id: string, status: string) => void
  onEditBooking: (booking: BookingWithService) => void
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

        <button
          onClick={() => onEditBooking(booking)}
          className="text-xs font-medium px-2.5 py-1 rounded-full border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 transition-colors"
        >
          Edit
        </button>

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
