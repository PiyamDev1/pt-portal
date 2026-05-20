'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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
  person_count_excludes_family_head?: boolean
  close_overrun_tolerance_minutes?: number
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
  { code: '+93', label: 'Afghanistan (+93)' },
  { code: '+355', label: 'Albania (+355)' },
  { code: '+213', label: 'Algeria (+213)' },
  { code: '+54', label: 'Argentina (+54)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+43', label: 'Austria (+43)' },
  { code: '+973', label: 'Bahrain (+973)' },
  { code: '+880', label: 'Bangladesh (+880)' },
  { code: '+32', label: 'Belgium (+32)' },
  { code: '+55', label: 'Brazil (+55)' },
  { code: '+359', label: 'Bulgaria (+359)' },
  { code: '+855', label: 'Cambodia (+855)' },
  { code: '+237', label: 'Cameroon (+237)' },
  { code: '+1', label: 'Canada/United States (+1)' },
  { code: '+56', label: 'Chile (+56)' },
  { code: '+86', label: 'China (+86)' },
  { code: '+57', label: 'Colombia (+57)' },
  { code: '+385', label: 'Croatia (+385)' },
  { code: '+357', label: 'Cyprus (+357)' },
  { code: '+420', label: 'Czech Republic (+420)' },
  { code: '+45', label: 'Denmark (+45)' },
  { code: '+20', label: 'Egypt (+20)' },
  { code: '+372', label: 'Estonia (+372)' },
  { code: '+358', label: 'Finland (+358)' },
  { code: '+33', label: 'France (+33)' },
  { code: '+49', label: 'Germany (+49)' },
  { code: '+30', label: 'Greece (+30)' },
  { code: '+852', label: 'Hong Kong (+852)' },
  { code: '+36', label: 'Hungary (+36)' },
  { code: '+354', label: 'Iceland (+354)' },
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+91', label: 'India (+91)' },
  { code: '+62', label: 'Indonesia (+62)' },
  { code: '+98', label: 'Iran (+98)' },
  { code: '+964', label: 'Iraq (+964)' },
  { code: '+353', label: 'Ireland (+353)' },
  { code: '+972', label: 'Israel (+972)' },
  { code: '+39', label: 'Italy (+39)' },
  { code: '+81', label: 'Japan (+81)' },
  { code: '+962', label: 'Jordan (+962)' },
  { code: '+7', label: 'Kazakhstan/Russia (+7)' },
  { code: '+254', label: 'Kenya (+254)' },
  { code: '+965', label: 'Kuwait (+965)' },
  { code: '+371', label: 'Latvia (+371)' },
  { code: '+961', label: 'Lebanon (+961)' },
  { code: '+370', label: 'Lithuania (+370)' },
  { code: '+60', label: 'Malaysia (+60)' },
  { code: '+356', label: 'Malta (+356)' },
  { code: '+52', label: 'Mexico (+52)' },
  { code: '+212', label: 'Morocco (+212)' },
  { code: '+31', label: 'Netherlands (+31)' },
  { code: '+64', label: 'New Zealand (+64)' },
  { code: '+234', label: 'Nigeria (+234)' },
  { code: '+47', label: 'Norway (+47)' },
  { code: '+92', label: 'Pakistan (+92)' },
  { code: '+970', label: 'Palestine (+970)' },
  { code: '+63', label: 'Philippines (+63)' },
  { code: '+48', label: 'Poland (+48)' },
  { code: '+351', label: 'Portugal (+351)' },
  { code: '+974', label: 'Qatar (+974)' },
  { code: '+40', label: 'Romania (+40)' },
  { code: '+966', label: 'Saudi Arabia (+966)' },
  { code: '+381', label: 'Serbia (+381)' },
  { code: '+65', label: 'Singapore (+65)' },
  { code: '+421', label: 'Slovakia (+421)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+82', label: 'South Korea (+82)' },
  { code: '+34', label: 'Spain (+34)' },
  { code: '+94', label: 'Sri Lanka (+94)' },
  { code: '+46', label: 'Sweden (+46)' },
  { code: '+41', label: 'Switzerland (+41)' },
  { code: '+886', label: 'Taiwan (+886)' },
  { code: '+66', label: 'Thailand (+66)' },
  { code: '+216', label: 'Tunisia (+216)' },
  { code: '+90', label: 'Turkey (+90)' },
  { code: '+971', label: 'United Arab Emirates (+971)' },
  { code: '+598', label: 'Uruguay (+598)' },
  { code: '+84', label: 'Vietnam (+84)' },
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

function getUtcMinutesOfDay(iso: string): number | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

function formatTimeFromMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatMinutesLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
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

function getServicePersonUnits(service: BookingServiceOption | undefined, personCount: number): number {
  if (!service) return Math.max(0, personCount)
  if (service.person_count_excludes_family_head === false) {
    return Math.max(0, personCount - 1)
  }
  return Math.max(0, personCount)
}

function personCountLabel(service: BookingServiceOption | undefined): string {
  if (!service) return 'Number of persons'
  return service.person_count_excludes_family_head === false
    ? 'Number of persons (including family head)'
    : 'Number of applicants (excluding family head)'
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
  const [panelServiceId, setPanelServiceId] = useState('')
  const [panelPersonCount, setPanelPersonCount] = useState(1)
  const [panelSlots, setPanelSlots] = useState<SlotOption[]>([])
  const [loadingPanelSlots, setLoadingPanelSlots] = useState(false)
  const [panelSlotsError, setPanelSlotsError] = useState<string | null>(null)
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
  const todayDateKey = useMemo(() => {
    const now = new Date()
    now.setUTCHours(0, 0, 0, 0)
    return now.toISOString().slice(0, 10)
  }, [])

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
    const requestedDate = options?.date ?? selectedDateKey
    const safeDate = requestedDate < todayDateKey ? todayDateKey : requestedDate
    const requestedStartTime = options?.start_time ?? ''
    let safeStartTime = requestedStartTime
    if (requestedStartTime) {
      const requestedStartDate = new Date(requestedStartTime)
      if (Number.isNaN(requestedStartDate.getTime()) || requestedStartDate.toISOString().slice(0, 10) !== safeDate) {
        safeStartTime = ''
      }
    }

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
      date: safeDate,
      start_time: safeStartTime,
      person_count: options?.person_count ?? 1,
    })
    setShowAppointmentModal(true)
  }, [selectedDateKey, serviceOptions, todayDateKey])

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

    // In edit mode, keep the original booked time unless the user explicitly picks another slot.
    // This allows same-slot updates (e.g. person count adjustments) even when recalculated slots differ.
    if (editingBooking && appointmentForm.start_time === editingBooking.start_time) {
      return
    }

    if (availableSlots.length === 0) {
      if (editingBooking && appointmentForm.start_time === editingBooking.start_time) {
        return
      }
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

    if (!editingBooking && appointmentForm.date && appointmentForm.date < todayDateKey) {
      toast.error('Cannot create appointments for past dates')
      return
    }

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

  useEffect(() => {
    if (!panelServiceId && serviceOptions.length > 0) {
      setPanelServiceId(serviceOptions[0].id)
    }
  }, [panelServiceId, serviceOptions])

  useEffect(() => {
    if (view !== 'week') return
    if (!selectedDateKey || !panelServiceId || selectedBookings.length > 0) {
      setPanelSlots([])
      setPanelSlotsError(null)
      return
    }

    let cancelled = false

    const run = async () => {
      setLoadingPanelSlots(true)
      const result = await loadSlotsFor(selectedDateKey, panelServiceId, panelPersonCount)
      if (cancelled) return
      setPanelSlots(result.slots)
      setPanelSlotsError(result.error)
      setLoadingPanelSlots(false)
    }

    run()

    return () => {
      cancelled = true
    }
  }, [loadSlotsFor, panelPersonCount, panelServiceId, selectedBookings.length, selectedDateKey, view])

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
              enableQuickAvailability={false}
              serviceOptions={serviceOptions}
              quickServiceId={panelServiceId}
              quickPersonCount={panelPersonCount}
              quickSlots={panelSlots}
              quickSlotsLoading={loadingPanelSlots}
              quickSlotsError={panelSlotsError}
              onQuickServiceChange={setPanelServiceId}
              onQuickPersonCountChange={(value) => setPanelPersonCount(Math.max(1, value))}
              onQuickSelectSlot={(slot) => openCreateAppointment({
                date: selectedDateKey,
                service_id: panelServiceId,
                person_count: panelPersonCount,
                start_time: slot.isoString,
              })}
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
              enableQuickAvailability={true}
              serviceOptions={serviceOptions}
              quickServiceId={panelServiceId}
              quickPersonCount={panelPersonCount}
              quickSlots={panelSlots}
              quickSlotsLoading={loadingPanelSlots}
              quickSlotsError={panelSlotsError}
              onQuickServiceChange={setPanelServiceId}
              onQuickPersonCountChange={(value) => setPanelPersonCount(Math.max(1, value))}
              onQuickSelectSlot={(slot) => openCreateAppointment({
                date: selectedDateKey,
                service_id: panelServiceId,
                person_count: panelPersonCount,
                start_time: slot.isoString,
              })}
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
                <input type="date" min={editingBooking ? undefined : todayDateKey} value={appointmentForm.date} onChange={(e) => setAppointmentForm((p) => ({ ...p, date: e.target.value, start_time: '' }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
              </label>
            </div>

            {(() => {
              const selectedService = serviceOptions.find((s) => s.id === appointmentForm.service_id)
              const effectiveDuration = selectedService
                ? selectedService.duration_minutes + getServicePersonUnits(selectedService, appointmentForm.person_count) * selectedService.duration_per_additional_person_minutes
                : null
              const nextStartGap = selectedService
                ? effectiveDuration! + Math.max(0, selectedService.buffer_minutes)
                : null

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="text-sm text-slate-700">
                    {personCountLabel(selectedService)}
                    <input
                      type="number"
                      min={1}
                      value={appointmentForm.person_count}
                      onChange={(e) => {
                        const value = Math.max(1, Number(e.target.value) || 1)
                        setAppointmentForm((p) => ({
                          ...p,
                          person_count: value,
                          start_time: editingBooking ? p.start_time : '',
                        }))
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

            {(() => {
              const svc = serviceOptions.find((s) => s.id === appointmentForm.service_id)
              const modalDuration = svc
                ? svc.duration_minutes + getServicePersonUnits(svc, appointmentForm.person_count) * svc.duration_per_additional_person_minutes
                : 30
              const dateBookings = activeBookings.filter((b) => b.start_time.startsWith(appointmentForm.date))
              return (
                <div className="text-sm text-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Select appointment time</span>
                    <span className="text-xs text-slate-400">Click the timeline to pick a start time</span>
                  </div>
                  {loadingSlots ? (
                    <div className="h-80 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Loading slots…</div>
                  ) : slotsError ? (
                    <div className="h-80 rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-center text-amber-700 text-sm">{slotsError}</div>
                  ) : !appointmentForm.date || !appointmentForm.service_id ? (
                    <div className="h-80 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Select a service and date to see the timeline.</div>
                  ) : (
                    <SlotTimeline
                      date={appointmentForm.date}
                      availableSlots={availableSlots}
                      existingBookings={dateBookings}
                      selectedIso={appointmentForm.start_time}
                      durationMinutes={modalDuration}
                      onSelect={(iso) => setAppointmentForm((p) => ({ ...p, start_time: iso }))}
                    />
                  )}
                  {appointmentForm.start_time && (
                    <p className="mt-2 text-xs text-indigo-700 font-medium">
                      Selected: {formatTime(appointmentForm.start_time)}
                      {' '}(duration: {modalDuration} min)
                    </p>
                  )}
                  {editingBooking && !loadingSlots && availableSlots.length === 0 && appointmentForm.date && appointmentForm.service_id && appointmentForm.start_time === editingBooking.start_time && (
                    <p className="mt-1 text-xs text-emerald-700">Current booked time retained.</p>
                  )}
                  {editingBooking && <p className="mt-1 text-xs text-slate-500">Current booking time is preselected. Click a different time to reschedule.</p>}
                </div>
              )
            })()}

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
        <div className="py-8 px-5 text-center">
          <p className="text-slate-400 text-sm">No appointments on this day</p>
          {enableQuickAvailability && (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available appointments</p>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-sm text-slate-700">
                  Service
                  <select value={quickServiceId} onChange={(e) => onQuickServiceChange(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2">
                    <option value="">Select service</option>
                    {serviceOptions.map((service) => (
                      <option key={service.id} value={service.id}>{service.name}</option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-slate-700">
                  {personCountLabel(serviceOptions.find((service) => service.id === quickServiceId))}
                  <input type="number" min={1} value={quickPersonCount} onChange={(e) => onQuickPersonCountChange(Number(e.target.value) || 1)} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2" />
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
    ? selectedService.duration_minutes + getServicePersonUnits(selectedService, personCount) * selectedService.duration_per_additional_person_minutes
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
      const fallbackEnd = startMinutes + Math.max(1, booking.booking_services?.duration_minutes ?? 30)
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
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs text-slate-600">
                    Total idle gaps: <span className="font-semibold text-slate-800">{formatMinutesLabel(timeline.totalGapMinutes)}</span>
                    {' · '}
                    Overlaps: <span className={`font-semibold ${timeline.overlapCount > 0 ? 'text-red-700' : 'text-emerald-700'}`}>{timeline.overlapCount}</span>
                  </p>
                </div>

                <div className="space-y-2">
                  {timeline.items.map((item) => {
                    if (item.type === 'gap') {
                      return (
                        <div key={item.key} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                          Gap: {formatMinutesLabel(item.minutes)}
                        </div>
                      )
                    }

                    if (item.type === 'overlap') {
                      return (
                        <div key={item.key} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
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
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-base font-semibold text-slate-800">
                              {formatTimeFromMinutes(item.startMinutes)}-{formatTimeFromMinutes(item.endMinutes)} · {item.booking.customer_name}
                            </p>
                            <p className="mt-1 text-sm text-slate-500">
                              {item.booking.booking_services?.name || 'Service'}
                              {item.booking.person_count && item.booking.person_count > 1 ? ` · ${item.booking.person_count} people` : ''}
                            </p>
                            <p className="mt-1 text-xs text-slate-400">{item.booking.customer_phone}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${status.bg} ${status.text}`}>
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
                {personCountLabel(selectedService)}
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

// ─── Timeline slot picker ─────────────────────────────────────────────────────

const TIMELINE_PX_PER_MIN = 1.5
const TIMELINE_START_HOUR = 8
const TIMELINE_END_HOUR   = 19

function timeHHMMToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function SlotTimeline({
  date,
  availableSlots,
  existingBookings,
  selectedIso,
  durationMinutes,
  onSelect,
}: {
  date: string
  availableSlots: SlotOption[]
  existingBookings: BookingWithService[]
  selectedIso: string
  durationMinutes: number
  onSelect: (iso: string) => void
}) {
  const TIMELINE_START = TIMELINE_START_HOUR * 60
  const TIMELINE_END   = TIMELINE_END_HOUR * 60
  const totalMinutes   = TIMELINE_END - TIMELINE_START
  const totalHeight    = totalMinutes * TIMELINE_PX_PER_MIN

  const containerRef = useRef<HTMLDivElement>(null)

  const dayStartMs = useMemo(() => new Date(`${date}T00:00:00Z`).getTime(), [date])

  // Build contiguous available ranges for the green tint background
  const availableRanges = useMemo(() => {
    if (availableSlots.length === 0) return []
    const sorted = [...availableSlots].map((s) => timeHHMMToMins(s.time)).sort((a, b) => a - b)
    const ranges: { start: number; end: number }[] = []
    let rangeStart = sorted[0]
    let prev = sorted[0]
    for (let i = 1; i < sorted.length; i++) {
      const m = sorted[i]
      if (m - prev <= 10) {
        prev = m
      } else {
        ranges.push({ start: rangeStart, end: prev + durationMinutes })
        rangeStart = m
        prev = m
      }
    }
    ranges.push({ start: rangeStart, end: prev + durationMinutes })
    return ranges
  }, [availableSlots, durationMinutes])

  // Compute pixel positions for existing bookings
  const bookingBlocks = useMemo(
    () =>
      existingBookings.map((b) => {
        const startMs = new Date(b.start_time).getTime()
        const endMs   = new Date(b.end_time).getTime()
        const startMin = (startMs - dayStartMs) / 60000
        const durMin   = Math.max((endMs - startMs) / 60000, 5)
        return {
          id: b.id,
          startMin,
          durMin,
          name: b.customer_name,
          service: b.booking_services?.name ?? '',
          status: b.status,
        }
      }),
    [existingBookings, dayStartMs],
  )

  // Selected slot in minutes since midnight UTC
  const selectedMin = useMemo(
    () => (selectedIso ? (new Date(selectedIso).getTime() - dayStartMs) / 60000 : null),
    [selectedIso, dayStartMs],
  )

  // Scroll to selected or first available slot when date/slots change
  const firstSlotTime = availableSlots[0]?.time ?? ''
  useEffect(() => {
    if (!containerRef.current) return
    const targetMin =
      selectedMin ??
      (firstSlotTime ? timeHHMMToMins(firstSlotTime) : null)
    if (targetMin === null) return
    const y = (targetMin - TIMELINE_START) * TIMELINE_PX_PER_MIN
    containerRef.current.scrollTop = Math.max(0, y - 80)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, firstSlotTime, selectedIso])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (availableSlots.length === 0) return
      const rect = e.currentTarget.getBoundingClientRect()
      const clickedY = (e.clientY - rect.top) + e.currentTarget.scrollTop
      // subtract the label column width (40px)
      const bodyX = e.clientX - rect.left - 40
      if (bodyX < 0) return  // clicked label column, ignore
      const clickedMin = TIMELINE_START + clickedY / TIMELINE_PX_PER_MIN
      let nearest = availableSlots[0]
      let minDist = Math.abs(timeHHMMToMins(nearest.time) - clickedMin)
      for (const slot of availableSlots) {
        const dist = Math.abs(timeHHMMToMins(slot.time) - clickedMin)
        if (dist < minDist) { minDist = dist; nearest = slot }
      }
      onSelect(nearest.isoString)
    },
    [availableSlots, onSelect],
  )

  const yFor = (mins: number) => (mins - TIMELINE_START) * TIMELINE_PX_PER_MIN
  const hours: number[] = []
  for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h++) hours.push(h)

  const noSlotsMsg = availableSlots.length === 0
    ? 'No available slots — all times are booked or outside working hours.'
    : null

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      {noSlotsMsg ? (
        <div className="h-80 flex items-center justify-center text-slate-400 text-sm bg-slate-50">
          {noSlotsMsg}
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex items-center gap-4 px-3 py-2 border-b border-slate-100 bg-slate-50 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-400" />
              Available — click to select
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-indigo-500" />
              Booked
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm bg-indigo-100 border-2 border-indigo-600" />
              Selected
            </span>
          </div>

          {/* Scrollable timeline */}
          <div
            ref={containerRef}
            className="relative overflow-y-scroll overflow-x-hidden cursor-pointer select-none"
            style={{ height: 320 }}
            onClick={handleClick}
            title="Click to select a time"
          >
            <div className="relative" style={{ height: totalHeight }}>
              {/* ── Hour labels (left 40px) ── */}
              {hours.map((h) => (
                <div
                  key={`lbl-${h}`}
                  className="absolute left-0 w-10 text-[10px] font-medium text-slate-400 leading-none text-right pr-2"
                  style={{ top: yFor(h * 60) - 5 }}
                >
                  {String(h).padStart(2, '0')}:00
                </div>
              ))}

              {/* ── Timeline body (inset 40px from left) ── */}
              <div className="absolute inset-y-0 left-10 right-0">
                {/* Hour grid lines */}
                {hours.map((h) => (
                  <div
                    key={`hour-line-${h}`}
                    className="absolute left-0 right-0 border-t border-slate-200"
                    style={{ top: yFor(h * 60) }}
                  />
                ))}
                {/* 30-min dashed lines */}
                {hours.map((h) => (
                  <div
                    key={`half-line-${h}`}
                    className="absolute left-0 right-0 border-t border-dashed border-slate-100"
                    style={{ top: yFor(h * 60 + 30) }}
                  />
                ))}

                {/* Available regions (green tint) */}
                {availableRanges.map((r, i) => {
                  const top    = yFor(r.start)
                  const height = (r.end - r.start) * TIMELINE_PX_PER_MIN
                  if (top + height < 0 || top > totalHeight) return null
                  return (
                    <div
                      key={`avail-${i}`}
                      className="absolute left-0 right-0 bg-emerald-50 border-l-2 border-emerald-400 pointer-events-none"
                      style={{ top, height }}
                    />
                  )
                })}

                {/* Existing booking blocks */}
                {bookingBlocks.map((b) => {
                  const top    = yFor(b.startMin)
                  const height = Math.max(b.durMin * TIMELINE_PX_PER_MIN, 18)
                  if (top + height < 0 || top > totalHeight) return null
                  return (
                    <div
                      key={b.id}
                      className="absolute left-1 right-1 rounded bg-indigo-500 px-2 overflow-hidden pointer-events-none z-10"
                      style={{ top, height }}
                    >
                      <p className="text-[10px] font-semibold text-white truncate leading-tight pt-0.5">{b.name}</p>
                      {b.service && <p className="text-[9px] text-indigo-200 truncate">{b.service}</p>}
                    </div>
                  )
                })}

                {/* Selected appointment block */}
                {selectedMin !== null && (
                  <div
                    className="absolute left-1 right-1 rounded-lg border-2 border-indigo-600 bg-indigo-100 z-20 pointer-events-none"
                    style={{
                      top: yFor(selectedMin),
                      height: Math.max(durationMinutes * TIMELINE_PX_PER_MIN, 20),
                    }}
                  >
                    <p className="text-[10px] font-semibold text-indigo-700 px-2 pt-0.5">
                      {formatTime(selectedIso)} — {durationMinutes} min
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Booking row ──────────────────────────────────────────────────────────────

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
