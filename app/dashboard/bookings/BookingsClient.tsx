'use client'

import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { toast } from 'sonner'
import { BookingStatus, BookingSource, type BookingDraftPayload, type BookingWaitlistEntry } from '@/app/types/bookings'
import BookingSettingsTab, {
  type BranchLocationOption,
} from '@/app/dashboard/settings/components/BookingSettingsTab'
import BookingHistoryModal from '@/app/dashboard/bookings/BookingHistoryModal'
import BookingWaitlistModal from '@/app/dashboard/bookings/BookingWaitlistModal'
import { useBookingDraft } from '@/app/dashboard/bookings/useBookingDraft'
import { resolveAppointmentStartTime } from '@/lib/bookingTimeSelection'

interface BookingWithService {
  id: string
  customer_name: string
  customer_phone: string
  customer_email: string
  service_id: string
  person_count?: number
  tags?: string[]
  start_time: string
  end_time: string
  status: BookingStatus
  source: BookingSource
  notes: string | null
  manual_override?: boolean
  last_email_sent_at?: string | null
  last_email_status?: string | null
  last_email_subject?: string | null
  reschedule_count?: number
  attendance_status?: 'unknown' | 'present' | 'missed' | 'manual_no_show'
  created_at: string
  updated_at?: string
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

const WEEK_BLOCK_COLORS: Record<string, { bg: string; hover: string }> = {
  pending:   { bg: 'bg-amber-400',   hover: 'hover:bg-amber-500'   },
  confirmed: { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600' },
  completed: { bg: 'bg-slate-400',   hover: 'hover:bg-slate-500'   },
  cancelled: { bg: 'bg-red-300',     hover: 'hover:bg-red-400'     },
}

const SOURCE_CONFIG: Record<string, string> = {
  portal: 'bg-indigo-100 text-indigo-700',
  whatsapp: 'bg-green-100 text-green-700',
  website: 'bg-blue-100 text-blue-700',
}

const STATUS_ACCESSIBILITY: Record<string, { short: string; pill: string }> = {
  pending: { short: 'P', pill: 'border-amber-200 bg-amber-50 text-amber-700' },
  confirmed: { short: 'C', pill: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  completed: { short: 'D', pill: 'border-slate-200 bg-slate-100 text-slate-700' },
  cancelled: { short: 'X', pill: 'border-red-200 bg-red-50 text-red-700' },
}

function SparkIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M10 2.5l1.4 3.6L15 7.5l-3.6 1.4L10 12.5 8.6 8.9 5 7.5l3.6-1.4L10 2.5Z" />
      <path d="M4.5 12.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" />
      <path d="M15.5 11l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8.8-1.9Z" />
    </svg>
  )
}

function CalendarIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M6.5 2.8v3.4M13.5 2.8v3.4M3 8.2h14" />
    </svg>
  )
}

function WeekIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M7.7 4v12M12.3 4v12M3 8h14" />
    </svg>
  )
}

function ListIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M6.5 5h9M6.5 10h9M6.5 15h9" />
      <circle cx="4" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="15" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function ChevronLeftIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M11.8 4.5 6.2 10l5.6 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronRightIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="m8.2 4.5 5.6 5.5-5.6 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RefreshIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
      <path d="M15.5 8A5.5 5.5 0 1 0 16 10" strokeLinecap="round" />
      <path d="M13.5 4.8h2.8v2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SettingsIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M10 3.2v2.1M10 14.7v2.1M15.1 5.3l-1.5 1.5M6.4 14l-1.5 1.5M16.8 10h-2.1M5.3 10H3.2M15.1 14.7l-1.5-1.5M6.4 6l-1.5-1.5" strokeLinecap="round" />
      <circle cx="10" cy="10" r="3.1" />
    </svg>
  )
}

function PlusIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="M10 4.5v11M4.5 10h11" strokeLinecap="round" />
    </svg>
  )
}

function ClockIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5v4l2.7 1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PinIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M10 17s4.5-4.3 4.5-8A4.5 4.5 0 1 0 5.5 9c0 3.7 4.5 8 4.5 8Z" />
      <circle cx="10" cy="9" r="1.8" />
    </svg>
  )
}

function FilterIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M3.5 5h13l-5.2 5.5v4l-2.6 1v-5L3.5 5Z" strokeLinejoin="round" />
    </svg>
  )
}

function EyeIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <path d="M2.8 10s2.7-4.5 7.2-4.5 7.2 4.5 7.2 4.5-2.7 4.5-7.2 4.5S2.8 10 2.8 10Z" />
      <circle cx="10" cy="10" r="2.1" />
    </svg>
  )
}

function PendingIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 6.5v3.8l2.4 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ConfirmedIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" />
      <path d="m7.3 10.2 1.8 1.8 3.6-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PencilIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
      <path d="m4.2 13.9 1.2 1.9 2.1-.7 7-7a1.7 1.7 0 0 0-2.4-2.4l-7 7-.9 2.2Z" strokeLinejoin="round" />
      <path d="m10.8 5.9 3.3 3.3" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.9" className={className} aria-hidden="true">
      <path d="m5.2 10.4 3 3.1 6.6-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function DoneIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="m3.9 10.5 2.3 2.4 3.5-4.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m9.1 10.5 2.3 2.4 4.7-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CloseIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true">
      <path d="m6 6 8 8M14 6l-8 8" strokeLinecap="round" />
    </svg>
  )
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
  const today = useMemo(() => {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    return d
  }, [])

  const [view, setView] = useState<'week' | 'list' | 'multi'>('multi')
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today))
  const [monthStart, setMonthStart] = useState<Date>(() => startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [mobileWeekDayIndex, setMobileWeekDayIndex] = useState(0)
  const [mobileListMode, setMobileListMode] = useState<'day' | 'week'>('day')
  const [mobileCalendarMode, setMobileCalendarMode] = useState<'grid' | 'agenda'>('grid')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  const [bookings, setBookings] = useState<BookingWithService[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<'all' | BookingSource>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | BookingStatus>('all')
  const [serviceFilter, setServiceFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCancelled, setShowCancelled] = useState(true)
  const [showSaveViewForm, setShowSaveViewForm] = useState(false)
  const [saveViewName, setSaveViewName] = useState('')
  const [savedViews, setSavedViews] = useState<Array<{
    name: string
    source: 'all' | BookingSource
    status: 'all' | BookingStatus
    serviceId: string
    searchQuery: string
    showCancelled: boolean
  }>>([])
  const [bookingReport, setBookingReport] = useState<{
    totals: Record<string, number>
    by_status: Record<string, number>
    by_source: Record<string, number>
    by_service: Record<string, number>
  } | null>(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string>(
    userLocationId || branchLocations[0]?.id || ''
  )
  const [serviceOptions, setServiceOptions] = useState<BookingServiceOption[]>([])
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [showWaitlistModal, setShowWaitlistModal] = useState(false)
  const [showRescheduleOnly, setShowRescheduleOnly] = useState(false)
  const [editingBooking, setEditingBooking] = useState<BookingWithService | null>(null)
  const [historyBookingId, setHistoryBookingId] = useState<string | null>(null)
  const [resendingBookingId, setResendingBookingId] = useState<string | null>(null)
  const [savingBooking, setSavingBooking] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [refreshCountdown, setRefreshCountdown] = useState(120)
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
  const [waitlistEntries, setWaitlistEntries] = useState<BookingWaitlistEntry[]>([])
  const [showNotesEditor, setShowNotesEditor] = useState(false)
  const [notesAutosaveState, setNotesAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const notesAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesSavedHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesAutosaveAbortRef = useRef<AbortController | null>(null)
  const notesAutosaveSkipNextRef = useRef(false)
  const latestNotesRef = useRef('')
  const lastBackgroundRefreshAtRef = useRef(0)
  const confirmTokenRef = useRef(0)
  const [appointmentForm, setAppointmentForm] = useState<BookingDraftPayload>({
    customer_name: '',
    customer_email: '',
    phone_country_code: '+44',
    phone_local: '',
    service_id: '',
    notes: '',
    tags: '',
    date: '',
    start_time: '',
    end_time: '',
    manual_override: false,
    person_count: 1,
  })

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(weekStart.getUTCDate() + i)
    return d
  })

  useEffect(() => {
    const selectedIndex = weekDays.findIndex((day) => isSameUTCDay(day, selectedDate))
    const todayIndex = weekDays.findIndex((day) => isSameUTCDay(day, today))
    const nextIndex = selectedIndex >= 0 ? selectedIndex : todayIndex >= 0 ? todayIndex : 0
    setMobileWeekDayIndex(nextIndex)
  }, [selectedDate, today, weekStart, weekDays])

  const calendarGridStart = useMemo(() => startOfCalendarGrid(monthStart), [monthStart])
  const calendarDays = useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const d = new Date(calendarGridStart)
    d.setUTCDate(calendarGridStart.getUTCDate() + i)
    return d
  }), [calendarGridStart])
  const mobileAgendaDays = useMemo(
    () => calendarDays.filter((day) => day.getUTCMonth() === monthStart.getUTCMonth()),
    [calendarDays, monthStart],
  )

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
      params.set('status', statusFilter)
      params.set('source', sourceFilter)
      params.set('service_id', serviceFilter)
      params.set('include_cancelled', String(showCancelled))
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim())
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
  }, [fromISO, searchQuery, selectedLocationId, serviceFilter, showCancelled, sourceFilter, statusFilter, toISO])

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

  const fetchBookingReport = useCallback(async () => {
    if (!selectedLocationId) {
      setBookingReport(null)
      return
    }
    setReportLoading(true)
    try {
      const params = new URLSearchParams({
        from: fromISO,
        to: toISO,
        location_id: selectedLocationId,
      })
      const res = await fetch(`/api/bookings/report?${params.toString()}`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) {
        setBookingReport(json)
      }
    } finally {
      setReportLoading(false)
    }
  }, [fromISO, selectedLocationId, toISO])

  const fetchWaitlist = useCallback(async () => {
    if (!selectedLocationId) {
      setWaitlistEntries([])
      return
    }
    try {
      const res = await fetch(`/api/bookings/waitlist?location_id=${encodeURIComponent(selectedLocationId)}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) return
      setWaitlistEntries(json.entries || [])
    } catch {
      setWaitlistEntries([])
    }
  }, [selectedLocationId])

  const fetchBookingsThrottled = useCallback(() => {
    const now = Date.now()
    if (now - lastBackgroundRefreshAtRef.current < 5000) return
    lastBackgroundRefreshAtRef.current = now
    fetchBookings(true)
  }, [fetchBookings])

  useEffect(() => {
    fetchBookings(false)
  }, [fetchBookings])

  useEffect(() => {
    fetchServices()
  }, [fetchServices])

  useEffect(() => {
    fetchBookingReport()
  }, [fetchBookingReport])

  useEffect(() => {
    fetchWaitlist()
  }, [fetchWaitlist])

  useEffect(() => {
    if (!selectedLocationId) return
    let active = true

    const run = async () => {
      try {
        const res = await fetch(`/api/bookings/preferences?location_id=${encodeURIComponent(selectedLocationId)}`, { cache: 'no-store' })
        const json = await res.json()
        if (!active || !res.ok) return
        setSavedViews(json.saved_views || [])
      } catch {
        if (active) setSavedViews([])
      }
    }

    run()
    return () => {
      active = false
    }
  }, [selectedLocationId])

  useEffect(() => {
    if (!showSettings) {
      fetchServices()
    }
  }, [showSettings, fetchServices])

  useEffect(() => {
    if (showSettings) return

    if (!autoRefresh) return

    const intervalId = setInterval(() => {
      fetchBookingsThrottled()
    }, 120000)

    const onFocus = () => fetchBookingsThrottled()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchBookingsThrottled()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearInterval(intervalId)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [autoRefresh, fetchBookingsThrottled, showSettings])

  useEffect(() => {
    if (!autoRefresh || showSettings) return
    setRefreshCountdown(120)
    const tick = setInterval(() => setRefreshCountdown((p) => Math.max(0, p - 1)), 1000)
    return () => clearInterval(tick)
  }, [autoRefresh, showSettings, lastUpdatedAt])

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
    setShowNotesEditor(false)
    setNotesAutosaveState('idle')
    setAppointmentForm({
      customer_name: '',
      customer_email: '',
      phone_country_code: '+44',
      phone_local: '',
      service_id: options?.service_id ?? serviceOptions[0]?.id ?? '',
      notes: '',
      tags: '',
      date: safeDate,
      start_time: safeStartTime,
      end_time: '',
      manual_override: false,
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

  const allActiveBookings = bookings.filter((b) => b.status !== BookingStatus.CANCELLED)
  const visibleBookings = bookings.filter((b) => {
    if (sourceFilter !== 'all' && b.source !== sourceFilter) return false
    if (statusFilter !== 'all' && b.status !== statusFilter) return false
    if (serviceFilter !== 'all' && b.service_id !== serviceFilter) return false
    if (!showCancelled && b.status === BookingStatus.CANCELLED) return false
    if (searchQuery.trim()) {
      const haystack = [
        b.customer_name,
        b.customer_phone,
        b.customer_email,
        b.notes || '',
        b.booking_services?.name || '',
        Array.isArray(b.tags) ? b.tags.join(' ') : '',
      ].join(' ').toLowerCase()
      if (!haystack.includes(searchQuery.trim().toLowerCase())) return false
    }
    return true
  })
  const activeBookings = visibleBookings.filter((b) => b.status !== BookingStatus.CANCELLED)
  const cancelledBookings = visibleBookings.filter((b) => b.status === BookingStatus.CANCELLED)

  const bookingsForDate = (date: Date) =>
    activeBookings.filter((b) => isSameUTCDay(new Date(b.start_time), date))

  const selectedBookings = bookingsForDate(selectedDate)

  const { draftState, clearDraft } = useBookingDraft({
    enabled: showAppointmentModal,
    editing: Boolean(editingBooking),
    locationId: selectedLocationId,
    form: appointmentForm,
    setForm: setAppointmentForm,
  })

  const trackBookingMetric = useCallback(async (eventName: string, metadata?: Record<string, unknown>) => {
    try {
      await fetch('/api/bookings/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventName, metadata: metadata || {} }),
      })
    } catch {
      // Ignore telemetry transport issues.
    }
  }, [])

  const persistSavedViews = useCallback(async (nextSavedViews: typeof savedViews) => {
    if (!selectedLocationId) return false
    const res = await fetch('/api/bookings/preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location_id: selectedLocationId,
        saved_views: nextSavedViews,
      }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      toast.error(json.error || 'Failed to save booking views')
      return false
    }
    return true
  }, [selectedLocationId])

  const openSaveViewForm = useCallback(() => {
    setSaveViewName(`View ${savedViews.length + 1}`)
    setShowSaveViewForm(true)
  }, [savedViews.length])

  const saveCurrentView = useCallback(async () => {
    const trimmedName = saveViewName.trim()
    if (!trimmedName) {
      toast.error('Enter a name for this saved view')
      return
    }
    const nextSavedViews = [
      ...savedViews.filter((view) => view.name !== trimmedName),
      {
        name: trimmedName,
        source: sourceFilter,
        status: statusFilter,
        serviceId: serviceFilter,
        searchQuery,
        showCancelled,
      },
    ]
    const persisted = await persistSavedViews(nextSavedViews)
    if (!persisted) return
    setSavedViews(nextSavedViews)
    setShowSaveViewForm(false)
    setSaveViewName('')
    toast.success('Booking view saved')
  }, [persistSavedViews, saveViewName, savedViews, searchQuery, serviceFilter, showCancelled, sourceFilter, statusFilter])

  const applySavedView = useCallback((name: string) => {
    const viewConfig = savedViews.find((view) => view.name === name)
    if (!viewConfig) return
    setSourceFilter(viewConfig.source)
    setStatusFilter(viewConfig.status)
    setServiceFilter(viewConfig.serviceId)
    setSearchQuery(viewConfig.searchQuery)
    setShowCancelled(viewConfig.showCancelled)
  }, [savedViews])

  const removeSavedView = useCallback(async (name: string) => {
    const nextSavedViews = savedViews.filter((view) => view.name !== name)
    const persisted = await persistSavedViews(nextSavedViews)
    if (!persisted) return
    setSavedViews(nextSavedViews)
    toast.success('Saved view removed')
  }, [persistSavedViews, savedViews])

  const exportBookings = useCallback(() => {
    const params = new URLSearchParams({ from: fromISO, to: toISO })
    if (selectedLocationId) params.set('location_id', selectedLocationId)
    params.set('status', statusFilter)
    params.set('source', sourceFilter)
    window.open(`/api/bookings/export?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }, [fromISO, selectedLocationId, sourceFilter, statusFilter, toISO])

  const resendBookingEmail = useCallback(async (booking: BookingWithService, kind?: 'confirmation' | 'modification' | 'cancellation') => {
    setResendingBookingId(booking.id)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to resend appointment email')
        return
      }
      if (json.email_warning) {
        toast.warning(`Email resend warning: ${json.email_warning}`)
      } else {
        toast.success('Appointment email re-sent')
      }
      await fetchBookings(false)
    } finally {
      setResendingBookingId(null)
    }
  }, [fetchBookings])

  const confirmWithToast = useCallback((message: string, confirmLabel = 'Confirm') => {
    return new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (value: boolean) => {
        if (settled) return
        settled = true
        resolve(value)
      }
      const toastId = `booking-confirm-${++confirmTokenRef.current}`
      toast(message, {
        id: toastId,
        duration: 10000,
        action: {
          label: confirmLabel,
          onClick: () => settle(true),
        },
        cancel: {
          label: 'Cancel',
          onClick: () => settle(false),
        },
        onDismiss: () => settle(false),
      })
    })
  }, [])

  const updateStatus = async (id: string, status: string, options?: { skipConfirm?: boolean; skipUndo?: boolean }) => {
    if (!options?.skipConfirm) {
      const confirmed = await confirmWithToast(`Change appointment status to ${status}?`, 'Change')
      if (!confirmed) return
    }

    const currentBooking = bookings.find((booking) => booking.id === id)
    const previousStatus = currentBooking?.status

    setUpdatingId(id)
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          if_unmodified_since: currentBooking?.updated_at,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.error(json.error || 'Appointment changed by another staff member. Reload and try again.')
          await fetchBookings(false)
          void trackBookingMetric('booking_status_conflict', { bookingId: id, nextStatus: status })
          return
        }
        toast.error(json.error || 'Failed to update appointment')
        void trackBookingMetric('booking_status_error', { bookingId: id, nextStatus: status, statusCode: res.status })
        return
      }
      if (json.email_warning) {
        toast.warning(`Appointment updated but email warning: ${json.email_warning}`)
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, ...json.booking, status: status as BookingStatus } : b))
      )

      if (!options?.skipUndo && previousStatus && previousStatus !== status) {
        toast('Status updated', {
          action: {
            label: 'Undo',
            onClick: () => {
              void updateStatus(id, previousStatus, { skipConfirm: true, skipUndo: true })
            },
          },
        })
      }
      void trackBookingMetric('booking_status_updated', { bookingId: id, nextStatus: status })
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

    const hasCustomManualTime = Boolean(booking.manual_override)

    setEditingBooking(booking)
    setShowRescheduleOnly(false)
    setSlotsError(null)
    setShowDayAgendaModal(false)
    setShowNotesEditor(Boolean(booking.notes))
    setNotesAutosaveState('idle')
    notesAutosaveSkipNextRef.current = true
    setAppointmentForm({
      customer_name: booking.customer_name,
      customer_email: booking.customer_email || '',
      phone_country_code: code,
      phone_local: local,
      service_id: booking.service_id,
      notes: booking.notes || '',
      tags: Array.isArray(booking.tags) ? booking.tags.join(', ') : '',
      date: booking.start_time.slice(0, 10),
      start_time: booking.start_time,
      end_time: booking.end_time,
      manual_override: hasCustomManualTime,
      person_count: booking.person_count ?? 1,
    })
    setShowAppointmentModal(true)
  }

  const closeAppointmentModal = useCallback(() => {
    setShowAppointmentModal(false)
    setCancelConfirmOpen(false)
    setShowRescheduleOnly(false)
    if (!editingBooking) {
      void clearDraft()
    }
  }, [clearDraft, editingBooking])

  const rescheduleBooking = useCallback(async (id: string, newStartTime: string, options?: { skipConfirm?: boolean; skipUndo?: boolean }) => {
    if (!options?.skipConfirm) {
      const confirmed = await confirmWithToast('Reschedule this appointment to the new time?', 'Reschedule')
      if (!confirmed) return
    }

    const currentBooking = bookings.find((booking) => booking.id === id)
    const previousStart = currentBooking?.start_time

    setUpdatingId(id)
    // Optimistic update
    setBookings((prev) =>
      prev.map((b) => b.id !== id ? b : { ...b, start_time: newStartTime })
    )
    try {
      const res = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_time: newStartTime,
          if_unmodified_since: currentBooking?.updated_at,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          toast.error(json.error || 'Appointment changed by another staff member. Reload and try again.')
          await fetchBookings(false)
          void trackBookingMetric('booking_reschedule_conflict', { bookingId: id })
          return
        }
        toast.error(json.error || 'Failed to reschedule appointment')
        void trackBookingMetric('booking_reschedule_error', { bookingId: id, statusCode: res.status })
        await fetchBookings(false) // revert optimistic update
        return
      }
      toast.success('Appointment rescheduled')
      if (!options?.skipUndo && previousStart && previousStart !== newStartTime) {
        toast('Appointment moved', {
          action: {
            label: 'Undo',
            onClick: () => {
              void rescheduleBooking(id, previousStart, { skipConfirm: true, skipUndo: true })
            },
          },
        })
      }
      void trackBookingMetric('booking_rescheduled', { bookingId: id })
      await fetchBookings(false)
    } finally {
      setUpdatingId(null)
    }
  }, [bookings, confirmWithToast, fetchBookings, trackBookingMetric])

  const flagNoShow = useCallback(async (booking: BookingWithService) => {
    const confirmed = await confirmWithToast('Flag this appointment as a no-show and apply penalty tracking?', 'Flag no-show')
    if (!confirmed) return

    setUpdatingId(booking.id)
    try {
      const res = await fetch(`/api/bookings/${booking.id}/no-show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Marked as no-show by staff from bookings dashboard' }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || 'Failed to flag no-show')
        return
      }
      toast.success('Appointment flagged as no-show')
      await fetchBookings(false)
    } finally {
      setUpdatingId(null)
    }
  }, [confirmWithToast, fetchBookings])

  const fetchAvailableSlots = useCallback(async () => {
    if (appointmentForm.manual_override) {
      setAvailableSlots([])
      setSlotsError(null)
      return
    }

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
  }, [appointmentForm.date, appointmentForm.manual_override, appointmentForm.person_count, appointmentForm.service_id, loadSlotsFor, selectedLocationId, showAppointmentModal])

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
    if (!showAppointmentModal && !showDayAgendaModal) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeAppointmentModal()
      setShowDayAgendaModal(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeAppointmentModal, showAppointmentModal, showDayAgendaModal])

  useEffect(() => {
    if (!showAppointmentModal || editingBooking) return
    if (!appointmentForm.manual_override || !appointmentForm.date || !appointmentForm.start_time) return
    if (appointmentForm.end_time) return

    const selectedService = serviceOptions.find((service) => service.id === appointmentForm.service_id)
    if (!selectedService) return

    const effectiveDuration = selectedService.duration_minutes +
      getServicePersonUnits(selectedService, appointmentForm.person_count) * selectedService.duration_per_additional_person_minutes
    const startMin = timeHHMMToMins(appointmentForm.start_time)
    const endMin = Math.min(startMin + Math.max(1, effectiveDuration), 23 * 60 + 59)

    setAppointmentForm((prev) => ({ ...prev, end_time: formatTimeFromMinutes(endMin) }))
  }, [
    appointmentForm.date,
    appointmentForm.end_time,
    appointmentForm.manual_override,
    appointmentForm.person_count,
    appointmentForm.service_id,
    appointmentForm.start_time,
    editingBooking,
    serviceOptions,
    showAppointmentModal,
  ])

  useEffect(() => {
    if (!showAppointmentModal || loadingSlots) return

    const nextStartTime = resolveAppointmentStartTime({
      availableSlots,
      currentStartTime: appointmentForm.start_time,
      editingBookingStartTime: editingBooking?.start_time,
      isEditing: Boolean(editingBooking),
    })

    if (nextStartTime === appointmentForm.start_time) return

    setAppointmentForm((prev) => ({ ...prev, start_time: nextStartTime }))
  }, [appointmentForm.start_time, availableSlots, editingBooking, loadingSlots, showAppointmentModal])

  useEffect(() => {
    latestNotesRef.current = appointmentForm.notes
  }, [appointmentForm.notes])

  useEffect(() => {
    if (!showAppointmentModal || !editingBooking) return
    if (notesAutosaveSkipNextRef.current) {
      notesAutosaveSkipNextRef.current = false
      return
    }

    setNotesAutosaveState('saving')

    if (notesAutosaveTimerRef.current) {
      clearTimeout(notesAutosaveTimerRef.current)
    }
    if (notesSavedHintTimerRef.current) {
      clearTimeout(notesSavedHintTimerRef.current)
    }
    notesAutosaveAbortRef.current?.abort()

    notesAutosaveTimerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      notesAutosaveAbortRef.current = controller
      try {
        const trimmed = latestNotesRef.current.trim() || null
        const res = await fetch(`/api/bookings/${editingBooking.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ notes: trimmed }),
          signal: controller.signal,
        })
        if (res.ok) {
          setBookings((prev) =>
            prev.map((booking) => booking.id === editingBooking.id ? { ...booking, notes: trimmed } : booking)
          )
          setNotesAutosaveState('saved')
          notesSavedHintTimerRef.current = setTimeout(() => setNotesAutosaveState('idle'), 1200)
        } else {
          setNotesAutosaveState('error')
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return
        }
        setNotesAutosaveState('error')
        // Keep autosave silent; manual Save still persists all fields.
      }
    }, 700)

    return () => {
      if (notesAutosaveTimerRef.current) {
        clearTimeout(notesAutosaveTimerRef.current)
      }
      if (notesSavedHintTimerRef.current) {
        clearTimeout(notesSavedHintTimerRef.current)
      }
      notesAutosaveAbortRef.current?.abort()
    }
  }, [appointmentForm.notes, editingBooking, showAppointmentModal])

  const saveAppointment = async () => {
    if (!selectedLocationId) return

    if (!editingBooking && appointmentForm.date && appointmentForm.date < todayDateKey) {
      toast.error('Cannot create appointments for past dates')
      return
    }

    const manualStartIso = appointmentForm.manual_override && appointmentForm.date && appointmentForm.start_time
      ? new Date(`${appointmentForm.date}T${appointmentForm.start_time}:00`).toISOString()
      : ''
    const manualEndIso = appointmentForm.manual_override && appointmentForm.date && appointmentForm.end_time
      ? new Date(`${appointmentForm.date}T${appointmentForm.end_time}:00`).toISOString()
      : ''

    if (appointmentForm.manual_override) {
      if (!appointmentForm.date || !appointmentForm.start_time || !appointmentForm.end_time) {
        toast.error('Manual override needs date, start time, and end time')
        return
      }
      const parsedStart = new Date(`${appointmentForm.date}T${appointmentForm.start_time}:00`)
      const parsedEnd = new Date(`${appointmentForm.date}T${appointmentForm.end_time}:00`)
      if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) {
        toast.error('Invalid manual start/end time')
        return
      }
      if (parsedEnd.getTime() <= parsedStart.getTime()) {
        toast.error('End time must be later than start time')
        return
      }
    }

    if (!appointmentForm.customer_name || !appointmentForm.customer_email || !appointmentForm.phone_local || !appointmentForm.service_id || (!appointmentForm.manual_override && !appointmentForm.start_time)) {
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
      const previousBookingSnapshot = editingBooking ? {
        customer_name: editingBooking.customer_name,
        customer_phone: editingBooking.customer_phone,
        customer_email: editingBooking.customer_email,
        service_id: editingBooking.service_id,
        notes: editingBooking.notes,
        tags: editingBooking.tags,
        start_time: editingBooking.start_time,
        person_count: editingBooking.person_count,
      } : null

      if (editingBooking) {
        const confirmed = await confirmWithToast('Apply these amendments to this appointment?', 'Apply')
        if (!confirmed) return
      }

      if (editingBooking) {
        const res = await fetch(`/api/bookings/${editingBooking.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: appointmentForm.customer_name,
            customer_phone,
            customer_email: appointmentForm.customer_email,
            service_id: appointmentForm.service_id,
            notes: appointmentForm.notes.trim() || null,
            tags: appointmentForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
            start_time: appointmentForm.manual_override ? manualStartIso : appointmentForm.start_time,
            end_time: appointmentForm.manual_override ? manualEndIso : undefined,
            manual_override: appointmentForm.manual_override,
            person_count: appointmentForm.person_count,
            if_unmodified_since: editingBooking.updated_at,
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          if (res.status === 409) {
            toast.error(json.error || 'Appointment changed by another staff member. Reload and try again.')
            await fetchBookings(false)
            void trackBookingMetric('booking_amend_conflict', { bookingId: editingBooking.id })
            return
          }
          toast.error(json.error || 'Failed to update appointment')
          void trackBookingMetric('booking_amend_error', { bookingId: editingBooking.id, statusCode: res.status })
          return
        }
        if (json.email_warning) {
          const prefix = json.email_resent
            ? 'Appointment updated and resend attempted, but email warning:'
            : 'Appointment updated but email warning:'
          toast.warning(`${prefix} ${json.email_warning}`)
        } else if (json.email_resent) {
          toast.success('Appointment updated and details re-sent to the new email')
        } else {
          toast.success('Appointment updated')
        }
        if (previousBookingSnapshot) {
          toast('Amendment saved', {
            action: {
              label: 'Undo',
              onClick: () => {
                void fetch(`/api/bookings/${editingBooking.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    ...previousBookingSnapshot,
                    if_unmodified_since: json?.booking?.updated_at,
                  }),
                }).then(() => fetchBookings(false))
              },
            },
          })
        }
        void trackBookingMetric('booking_amended', { bookingId: editingBooking.id })
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
            notes: appointmentForm.notes.trim() || null,
            tags: appointmentForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
            start_time: appointmentForm.manual_override ? manualStartIso : appointmentForm.start_time,
            end_time: appointmentForm.manual_override ? manualEndIso : undefined,
            manual_override: appointmentForm.manual_override,
            person_count: appointmentForm.person_count,
          }),
        })
        const json = await res.json()
        if (!res.ok) {
          toast.error(json.error || 'Failed to create appointment')
          void trackBookingMetric('booking_create_error', { statusCode: res.status, manual_override: appointmentForm.manual_override })
          return
        }
        if (json.email_warning) {
          toast.warning(`Appointment created but email warning: ${json.email_warning}`)
        } else {
          toast.success('Appointment created')
        }

        void trackBookingMetric('booking_created', { manual_override: appointmentForm.manual_override })
      }

      if (!editingBooking) {
        await clearDraft()
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
    const confirmed = await confirmWithToast('Cancel this appointment?', 'Cancel')
    if (!confirmed) return

    await updateStatus(editingBooking.id, BookingStatus.CANCELLED, { skipConfirm: true })
    setShowAppointmentModal(false)
    setEditingBooking(null)
  }

  const totalVisible = activeBookings.length
  const pendingVisible = activeBookings.filter((b) => b.status === BookingStatus.PENDING).length
  const confirmedVisible = activeBookings.filter((b) => b.status === BookingStatus.CONFIRMED).length
  const invalidLocalPhone = appointmentForm.phone_local.length > 0 && !isValidLocalPhone(appointmentForm.phone_local)
  const selectedManualService = serviceOptions.find((service) => service.id === appointmentForm.service_id)
  const expectedManualDuration = selectedManualService
    ? selectedManualService.duration_minutes + getServicePersonUnits(selectedManualService, appointmentForm.person_count) * selectedManualService.duration_per_additional_person_minutes
    : null
  const manualDurationMinutes = appointmentForm.manual_override && appointmentForm.start_time && appointmentForm.end_time
    ? timeHHMMToMins(appointmentForm.end_time) - timeHHMMToMins(appointmentForm.start_time)
    : null
  const editingBookingStartMinutes = editingBooking
    ? timeHHMMToMins(editingBooking.start_time.slice(11, 16))
    : null
  const currentSelectedMinutes = appointmentForm.start_time
    ? timeHHMMToMins(appointmentForm.start_time.slice(11, 16))
    : null
  const rescheduleSuggestions = useMemo(() => {
    if (
      !editingBooking ||
      appointmentForm.manual_override ||
      availableSlots.length === 0 ||
      editingBookingStartMinutes === null
    ) {
      return []
    }

    const seen = new Set<string>()
    return availableSlots
      .slice()
      .sort((a, b) => {
        const left = Math.abs(timeHHMMToMins(a.time) - editingBookingStartMinutes)
        const right = Math.abs(timeHHMMToMins(b.time) - editingBookingStartMinutes)
        if (left !== right) return left - right
        return timeHHMMToMins(a.time) - timeHHMMToMins(b.time)
      })
      .filter((slot) => {
        if (seen.has(slot.isoString)) return false
        seen.add(slot.isoString)
        return true
      })
      .slice(0, 5)
  }, [appointmentForm.manual_override, availableSlots, editingBooking, editingBookingStartMinutes])
  const manualOverrideWarning = expectedManualDuration !== null && manualDurationMinutes !== null
    ? (manualDurationMinutes <= 0
        ? 'End time must be later than start time.'
        : Math.abs(manualDurationMinutes - expectedManualDuration) > 30
          ? `Manual duration (${manualDurationMinutes} min) is far from service expectation (${expectedManualDuration} min).`
          : null)
    : null

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
  const sourceFilterLabel = sourceFilter === 'all'
    ? 'All sources'
    : sourceFilter.charAt(0).toUpperCase() + sourceFilter.slice(1)
  const statusFilterLabel = statusFilter === 'all'
    ? 'All statuses'
    : STATUS_CONFIG[statusFilter]?.label || statusFilter

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.12),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(99,102,241,0.14),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
      <div className="max-w-6xl mx-auto px-3 py-4 sm:px-6 md:py-8 space-y-6 relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-56 rounded-[2rem] bg-white/40 blur-3xl" />

        <div className="animate-enter-fade-up rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)] backdrop-blur xl:p-6">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-4">
              <div className="space-y-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-700">
                  <SparkIcon className="h-3.5 w-3.5" />
                  Booking desk
                </span>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Appointments</h1>
                    <p className="mt-1 text-sm text-slate-600">{view === 'multi' ? monthLabel : weekLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 self-start rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 shadow-sm">
                    <div className="flex rounded-xl border border-slate-200 overflow-hidden bg-white">
                      <button
                        onClick={() => setView('multi')}
                        className={`ui-tap ui-focus inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium transition-all sm:px-3 sm:text-sm ${
                          view === 'multi' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <CalendarIcon className="h-4 w-4" />
                        Calendar
                      </button>
                      <button
                        onClick={() => setView('week')}
                        className={`ui-tap ui-focus inline-flex items-center gap-1.5 border-l border-slate-200 px-2.5 py-2 text-xs font-medium transition-all sm:px-3 sm:text-sm ${
                          view === 'week' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <WeekIcon className="h-4 w-4" />
                        Week
                      </button>
                      <button
                        onClick={() => setView('list')}
                        className={`ui-tap ui-focus inline-flex items-center gap-1.5 border-l border-slate-200 px-2.5 py-2 text-xs font-medium transition-all sm:px-3 sm:text-sm ${
                          view === 'list' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <ListIcon className="h-4 w-4" />
                        List
                      </button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">{view === 'multi' ? <CalendarIcon className="h-3.5 w-3.5" /> : view === 'week' ? <WeekIcon className="h-3.5 w-3.5" /> : <ListIcon className="h-3.5 w-3.5" />}{view === 'multi' ? 'Calendar overview' : view === 'week' ? 'Week timeline' : 'Appointment list'}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600"><FilterIcon className="h-3.5 w-3.5" />{sourceFilterLabel}</span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600"><FilterIcon className="h-3.5 w-3.5" />{statusFilterLabel}</span>
                  {selectedLocationId && <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600"><PinIcon className="h-3.5 w-3.5" />Location active</span>}
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-[1.5rem] border border-red-100 bg-white/90 p-3 shadow-sm md:hidden">
              <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                <button
                  onClick={goToPrev}
                  className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600"
                  title={view === 'multi' ? 'Previous month' : 'Previous week'}
                >
                  <ChevronLeftIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={goToToday}
                  className={`ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold ${
                    isCurrentPeriod
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <ClockIcon className="h-4 w-4" />
                  Today
                </button>
                <button
                  onClick={goToNext}
                  className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-600"
                  title={view === 'multi' ? 'Next month' : 'Next week'}
                >
                  <ChevronRightIcon className="h-4 w-4" />
                </button>
              </div>

              {isAdmin && (
                <button
                  onClick={() => setShowSettings((prev) => !prev)}
                  className={`ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ${
                    showSettings
                      ? 'border-red-700 bg-red-700 text-white'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <SettingsIcon className="h-4 w-4" />
                  {showSettings ? 'Back to Appointments' : 'Booking Settings'}
                </button>
              )}

              {!showSettings && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => openCreateAppointment()}
                      className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#8b1d2c] px-3 text-sm font-semibold text-white shadow-sm"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add
                    </button>
                    <button
                      onClick={() => fetchBookings(true)}
                      disabled={refreshing}
                      className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
                    >
                      <RefreshIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  </div>

                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search customer, email, phone"
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                  />

                  <button
                    onClick={() => setMobileFiltersOpen((prev) => !prev)}
                    className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700"
                  >
                    <span className="inline-flex items-center gap-2">
                      <FilterIcon className="h-4 w-4" />
                      Filters
                    </span>
                    <span className="text-xs text-slate-500">
                      {mobileFiltersOpen ? 'Hide' : 'Show'}
                    </span>
                  </button>

                  {mobileFiltersOpen && (
                    <div className="grid gap-2 rounded-2xl border border-slate-100 bg-slate-50 p-3">
                      {branchLocations.length > 0 && (
                        <select
                          value={selectedLocationId}
                          onChange={(e) => setSelectedLocationId(e.target.value)}
                          className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                        >
                          {branchLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}{location.branch_code ? ` (${location.branch_code})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <select
                        value={sourceFilter}
                        onChange={(e) => setSourceFilter(e.target.value as 'all' | BookingSource)}
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="all">All sources</option>
                        <option value={BookingSource.PORTAL}>Portal</option>
                        <option value={BookingSource.WHATSAPP}>WhatsApp</option>
                        <option value={BookingSource.WEBSITE}>Website</option>
                      </select>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as 'all' | BookingStatus)}
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="all">All statuses</option>
                        <option value={BookingStatus.PENDING}>Pending</option>
                        <option value={BookingStatus.CONFIRMED}>Confirmed</option>
                        <option value={BookingStatus.COMPLETED}>Completed</option>
                        <option value={BookingStatus.CANCELLED}>Cancelled</option>
                      </select>
                      <select
                        value={serviceFilter}
                        onChange={(e) => setServiceFilter(e.target.value)}
                        className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                      >
                        <option value="all">All services</option>
                        {serviceOptions.map((service) => (
                          <option key={service.id} value={service.id}>{service.name}</option>
                        ))}
                      </select>
                      <label className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={showCancelled}
                          onChange={(e) => setShowCancelled(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-red-700"
                        />
                        Show cancelled
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={openSaveViewForm}
                          className="ui-tap ui-focus min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                        >
                          Save View
                        </button>
                        <button
                          onClick={exportBookings}
                          className="ui-tap ui-focus min-h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                        >
                          Export CSV
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="hidden items-center gap-2 flex-wrap rounded-2xl border border-slate-200/80 bg-slate-50/85 p-2.5 shadow-inner shadow-white/60 sm:p-3 md:flex">

            <button
              onClick={goToPrev}
              className="ui-tap ui-focus inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-all hover:-translate-y-0.5 hover:bg-slate-50"
              title={view === 'multi' ? 'Previous month' : 'Previous week'}
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </button>

            <button
              onClick={goToToday}
              className={`ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all hover:-translate-y-0.5 sm:text-sm ${
                isCurrentPeriod
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <ClockIcon className="h-4 w-4" />
              Today
            </button>

            <button
              onClick={goToNext}
              className="ui-tap ui-focus inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition-all hover:-translate-y-0.5 hover:bg-slate-50"
              title={view === 'multi' ? 'Next month' : 'Next week'}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </button>

            <button
              onClick={() => fetchBookings(true)}
              disabled={refreshing}
              className="ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-all hover:-translate-y-0.5 hover:bg-slate-50 disabled:opacity-50 sm:text-sm"
            >
              <RefreshIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>

            {isAdmin && (
              <button
                onClick={() => setShowSettings((prev) => !prev)}
                className={`ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all hover:-translate-y-0.5 sm:text-sm ${
                  showSettings
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <SettingsIcon className="h-4 w-4" />
                {showSettings ? 'Back to Appointments' : 'Booking Settings'}
              </button>
            )}

            {!showSettings && (
              <button
                onClick={() => openCreateAppointment()}
                className="ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border border-indigo-600 bg-indigo-600 px-3 py-2 text-xs font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-indigo-700 sm:text-sm"
              >
                <PlusIcon className="h-4 w-4" />
                Add Appointment
              </button>
            )}

            {!showSettings && branchLocations.length > 0 && (
              <div className="relative">
                <PinIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={selectedLocationId}
                  onChange={(e) => setSelectedLocationId(e.target.value)}
                  className="rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 transition-colors hover:border-slate-300 sm:text-sm"
                >
                  {branchLocations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}{location.branch_code ? ` (${location.branch_code})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!showSettings && (
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer, email, phone, notes"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:text-sm"
              />
            )}

            {!showSettings && (
              <div className="relative">
                <FilterIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value as 'all' | BookingSource)}
                  className="rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-700 transition-colors hover:border-slate-300 sm:text-sm"
                >
                  <option value="all">All sources</option>
                  <option value={BookingSource.PORTAL}>Portal</option>
                  <option value={BookingSource.WHATSAPP}>WhatsApp</option>
                  <option value={BookingSource.WEBSITE}>Website</option>
                </select>
              </div>
            )}

            {!showSettings && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | BookingStatus)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:text-sm"
              >
                <option value="all">All statuses</option>
                <option value={BookingStatus.PENDING}>Pending</option>
                <option value={BookingStatus.CONFIRMED}>Confirmed</option>
                <option value={BookingStatus.COMPLETED}>Completed</option>
                <option value={BookingStatus.CANCELLED}>Cancelled</option>
              </select>
            )}

            {!showSettings && (
              <select
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:text-sm"
              >
                <option value="all">All services</option>
                {serviceOptions.map((service) => (
                  <option key={service.id} value={service.id}>{service.name}</option>
                ))}
              </select>
            )}

            {!showSettings && (
              <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 sm:text-sm">
                <input
                  type="checkbox"
                  checked={showCancelled}
                  onChange={(e) => setShowCancelled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                />
                Show cancelled
              </label>
            )}

            {!showSettings && (
              <button
                onClick={openSaveViewForm}
                className="ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:text-sm"
              >
                Save View
              </button>
            )}

            {!showSettings && (
              <button
                onClick={exportBookings}
                className="ui-tap ui-focus inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:text-sm"
              >
                Export CSV
              </button>
            )}
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs text-slate-500 shadow-sm">
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-600"><ClockIcon className="h-4 w-4 text-slate-400" />Last updated: {refreshLabel}</span>
              {refreshing && <span className="rounded-full bg-indigo-50 px-2 py-1 font-medium text-indigo-600">Checking for changes...</span>}
              {autoRefresh && !refreshing && (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-500 tabular-nums">Next refresh in {refreshCountdown}s</span>
              )}
              {!autoRefresh && (
                <span className="rounded-full bg-amber-50 px-2 py-1 font-medium text-amber-600">Auto-refresh paused</span>
              )}
              <span className="ui-tap inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                <EyeIcon className="h-4 w-4 text-slate-500" />
                Visible {totalVisible}
              </span>
              <span className="ui-tap inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                <PendingIcon className="h-4 w-4" />
                Pending {pendingVisible}
              </span>
              <span className="ui-tap inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                <ConfirmedIcon className="h-4 w-4" />
                Confirmed {confirmedVisible}
              </span>
            </div>

            {!showSettings && showSaveViewForm && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs text-slate-500 shadow-sm">
                <input
                  value={saveViewName}
                  onChange={(e) => setSaveViewName(e.target.value)}
                  placeholder="View name"
                  className="min-w-[180px] rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm text-slate-700"
                />
                <button
                  onClick={() => void saveCurrentView()}
                  className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowSaveViewForm(false)
                    setSaveViewName('')
                  }}
                  className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            )}

            {!showSettings && savedViews.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-3 text-xs text-slate-500 shadow-sm">
                <span className="font-medium text-slate-600">Saved views</span>
                {savedViews.map((view) => (
                  <div key={view.name} className="inline-flex items-center overflow-hidden rounded-full border border-slate-200 bg-white">
                    <button
                      onClick={() => applySavedView(view.name)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {view.name}
                    </button>
                    <button
                      onClick={() => removeSavedView(view.name)}
                      className="border-l border-slate-200 px-2 py-1.5 text-xs text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!showSettings && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Total</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{reportLoading ? '…' : bookingReport?.totals?.total ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-amber-700">Pending</p>
                  <p className="mt-2 text-2xl font-semibold text-amber-800">{reportLoading ? '…' : bookingReport?.totals?.pending ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-emerald-700">Confirmed</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-800">{reportLoading ? '…' : bookingReport?.totals?.confirmed ?? 0}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Modified 24h</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-800">{reportLoading ? '…' : bookingReport?.totals?.recently_modified ?? 0}</p>
                </div>
              </div>
            )}
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
          <div className="animate-enter-fade-up animate-enter-delay-1 space-y-4">
            <div className="md:hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setMobileCalendarMode('grid')}
                  className={`ui-tap ui-focus flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    mobileCalendarMode === 'grid' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Grid
                </button>
                <button
                  type="button"
                  onClick={() => setMobileCalendarMode('agenda')}
                  className={`ui-tap ui-focus flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    mobileCalendarMode === 'agenda' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Agenda
                </button>
              </div>
            </div>

            {mobileCalendarMode === 'agenda' && (
              <div className="md:hidden overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.4)]">
                <div className="border-b border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#eef2ff_100%)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Month agenda</p>
                  <p className="mt-1 text-sm text-slate-600">Tap a day to manage appointments quickly</p>
                </div>
                {mobileAgendaDays.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-400">No days available for this month.</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {mobileAgendaDays.map((day) => {
                      const dayBookings = bookingsForDate(day)
                      const isToday = isSameUTCDay(day, today)
                      const isSelected = isSameUTCDay(day, selectedDate)
                      return (
                        <button
                          key={`agenda-${day.toISOString()}`}
                          type="button"
                          onClick={() => openDayAgenda(day)}
                          className={`ui-tap ui-focus w-full px-4 py-3 text-left transition-colors ${
                            isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className={`text-sm font-semibold ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>
                                {formatDateLabel(day)}
                                {isToday && (
                                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                                    Today
                                  </span>
                                )}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {dayBookings.length === 0
                                  ? 'No appointments'
                                  : `${dayBookings.length} appointment${dayBookings.length === 1 ? '' : 's'}`}
                              </p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${dayBookings.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                              {dayBookings.length}
                            </span>
                          </div>
                          {dayBookings.length > 0 && (
                            <p className="mt-1 text-xs text-slate-400 truncate">
                              Next: {formatTime(dayBookings[0].start_time)} {dayBookings[0].customer_name}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className={`${mobileCalendarMode === 'agenda' ? 'hidden md:block' : 'block'} overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.4)]`}>
              <div className="grid grid-cols-7 border-b border-slate-200 bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]">
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
                      className={`min-h-[96px] p-2 sm:min-h-[118px] sm:p-3 border-r border-b border-slate-100 text-left transition-all duration-150 ${
                        isSelected
                          ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
                          : isToday
                          ? 'bg-amber-50 ring-2 ring-inset ring-amber-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]'
                          : 'bg-white hover:-translate-y-0.5 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs sm:text-sm font-semibold ${
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
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                              Today
                            </span>
                          )}
                        </div>
                        {dayBookings.length > 0 && (
                          <span className="text-[10px] sm:text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {dayBookings.length}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 space-y-1.5">
                        {dayBookings.slice(0, 3).map((booking) => (
                          <div key={booking.id} className="flex items-center gap-1.5 rounded-md bg-slate-50/80 px-1.5 py-1 transition-colors hover:bg-slate-100/80">
                            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(booking.status)}`} />
                            <span className="text-[10px] sm:text-[11px] text-slate-500 truncate">
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
              onOpenHistory={(bookingId) => setHistoryBookingId(bookingId)}
              onResendEmail={resendBookingEmail}
              resendingBookingId={resendingBookingId}
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
          <div className="animate-enter-fade-up animate-enter-delay-1 space-y-3">
            <div className="md:hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weekDays.map((day, index) => {
                  const isActive = index === mobileWeekDayIndex
                  const isToday = isSameUTCDay(day, today)
                  const count = bookingsForDate(day).length
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => {
                        setMobileWeekDayIndex(index)
                        setSelectedDate(day)
                      }}
                      className={`ui-tap ui-focus min-w-[76px] rounded-xl border px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide">{DAY_LABELS[day.getUTCDay()]}</p>
                      <p className="mt-1 text-base font-bold">{day.getUTCDate()}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{count} booked{isToday ? ' · today' : ''}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            <WeekTimeline
              weekDays={weekDays}
              activeBookings={activeBookings}
              conflictBookings={allActiveBookings}
              today={today}
              loading={loading}
              mobileDayIndex={mobileWeekDayIndex}
              onSlotClick={(dateKey, startIso) =>
                openCreateAppointment({ date: dateKey, start_time: startIso })
              }
              onBookingClick={openEditBooking}
              onReschedule={rescheduleBooking}
              onStatusChange={updateStatus}
            />
          </div>
        )}

        {view === 'list' && (
          <div className="animate-enter-fade-up animate-enter-delay-1 space-y-3">
            <div className="md:hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setMobileListMode('day')}
                  className={`ui-tap ui-focus flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    mobileListMode === 'day' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Selected day
                </button>
                <button
                  type="button"
                  onClick={() => setMobileListMode('week')}
                  className={`ui-tap ui-focus flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    mobileListMode === 'week' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Full week
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {weekDays.map((day, index) => {
                  const isActive = index === mobileWeekDayIndex
                  const count = bookingsForDate(day).length
                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => {
                        setMobileWeekDayIndex(index)
                        setSelectedDate(day)
                      }}
                      className={`ui-tap ui-focus min-w-[76px] rounded-xl border px-3 py-2 text-left transition-colors ${
                        isActive
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wide">{DAY_LABELS[day.getUTCDay()]}</p>
                      <p className="mt-1 text-base font-bold">{day.getUTCDate()}</p>
                      <p className="mt-1 text-[10px] text-slate-400">{count} booked</p>
                    </button>
                  )
                })}
              </div>
            </div>

          <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)]">
            {loading ? (
              <div className="py-12 text-center text-slate-400 text-sm">Loading appointments…</div>
            ) : activeBookings.length === 0 ? (
              <div className="py-14 text-center">
                <div className="mx-auto max-w-sm rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8">
                  <p className="text-base font-semibold text-slate-700">No appointments this week</p>
                  <p className="mt-2 text-sm text-slate-400">Try another week, change the source filter, or add a new appointment.</p>
                </div>
              </div>
            ) : (
              weekDays.map((day, index) => {
                const hideOnMobile = mobileListMode === 'day' && index !== mobileWeekDayIndex
                const dayBookings = bookingsForDate(day)
                if (dayBookings.length === 0) return null
                const isToday = isSameUTCDay(day, today)
                return (
                  <div key={day.toISOString()} className={hideOnMobile ? 'hidden md:block' : 'block'}>
                    <div className={`px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center gap-2 ${isToday ? 'bg-indigo-50' : 'bg-slate-50'}`}>
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
                            onOpenHistory={(bookingId) => setHistoryBookingId(bookingId)}
                            onResendEmail={resendBookingEmail}
                            resendingBookingId={resendingBookingId}
                            updatingId={updatingId}
                          />
                        ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
          </div>
        )}

        {!showSettings && cancelledBookings.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
            <div className="px-5 py-3 border-b border-red-100 bg-[linear-gradient(180deg,_#fff1f2_0%,_#fef2f2_100%)] flex items-center justify-between">
              <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700"><CloseIcon className="h-4 w-4" />Cancelled Appointment Logs</h3>
              <span className="text-xs text-red-600">{cancelledBookings.length} cancelled</span>
            </div>
            <div className="divide-y divide-red-50 max-h-72 overflow-y-auto">
              {cancelledBookings
                .slice()
                .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
                .map((booking) => (
                  <div key={booking.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-red-50/40 transition-colors">
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

        {!showSettings && waitlistEntries.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-5 py-3">
              <h3 className="text-sm font-semibold text-amber-900">Waitlist</h3>
              <button onClick={() => setShowWaitlistModal(true)} className="rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-800">
                Add entry
              </button>
            </div>
            <div className="max-h-72 divide-y divide-amber-50 overflow-y-auto">
              {waitlistEntries.slice(0, 8).map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{entry.customer_name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {entry.preferred_date || 'Flexible date'} {entry.preferred_time_start ? `· ${entry.preferred_time_start}` : ''} · {entry.customer_phone}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-amber-800">
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAppointmentModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] md:items-center md:p-4">
          <div className="max-h-[94vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-b-none rounded-t-[24px] border border-white/70 bg-white p-4 shadow-[0_28px_90px_-36px_rgba(15,23,42,0.5)] transition-all duration-200 md:max-h-[90vh] md:rounded-[28px] md:p-5">
            <div className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur md:static md:m-0 md:bg-transparent md:p-0 md:pb-3">
              <div>
                <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-800">
                  <CalendarIcon className="h-5 w-5 text-indigo-600" />
                  {editingBooking ? 'Modify Appointment' : 'Add Appointment'}
                </h2>
                {!editingBooking && (
                  <p className="mt-1 text-xs text-slate-500">
                    Draft status: {draftState}
                  </p>
                )}
              </div>
              <button onClick={closeAppointmentModal} className="ui-tap ui-focus rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700">Close</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {editingBooking && (
                <div className="md:col-span-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-indigo-900">Quick reschedule</p>
                      <p className="text-xs text-indigo-700">
                        Keep the booking details and move the appointment time in one tap. Current slot: {formatTime(editingBooking.start_time)}.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowRescheduleOnly((prev) => !prev)}
                        className="ui-tap ui-focus rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        {showRescheduleOnly ? 'Show full edit' : 'Reschedule only'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAppointmentForm((p) => ({ ...p, start_time: editingBooking.start_time }))}
                        className="ui-tap ui-focus rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        Keep current time
                      </button>
                      {[15, 30, 60].map((minutes) => {
                        const shifted = new Date(new Date(editingBooking.start_time).getTime() + minutes * 60000).toISOString()
                        return (
                          <button
                            key={`later-${minutes}`}
                            type="button"
                            onClick={() => setAppointmentForm((p) => ({ ...p, start_time: shifted, manual_override: false }))}
                            className="ui-tap ui-focus rounded-full border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                          >
                            +{minutes} min
                          </button>
                        )
                      })}
                      {availableSlots.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const nextLaterSlot = availableSlots.find((slot) => slot.isoString > editingBooking.start_time)
                            const fallback = availableSlots[0]
                            setAppointmentForm((p) => ({ ...p, start_time: nextLaterSlot?.isoString || fallback.isoString, manual_override: false }))
                          }}
                          className="ui-tap ui-focus rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Next available
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (availableSlots[0]) setAppointmentForm((p) => ({ ...p, start_time: availableSlots[0].isoString, manual_override: false }))
                      }}
                      disabled={availableSlots.length === 0}
                      className="ui-tap ui-focus rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      First available
                    </button>
                    {rescheduleSuggestions.map((slot) => (
                      <button
                        key={slot.isoString}
                        type="button"
                        onClick={() => setAppointmentForm((p) => ({ ...p, start_time: slot.isoString, manual_override: false }))}
                        className={`ui-tap ui-focus rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                          slot.isoString === appointmentForm.start_time
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>

                  {currentSelectedMinutes !== null && editingBookingStartMinutes !== null && currentSelectedMinutes !== editingBookingStartMinutes && (
                    <p className="mt-2 text-xs font-medium text-emerald-700">
                      New time selected: {formatTime(appointmentForm.start_time)}.
                    </p>
                  )}
                </div>
              )}

              {!showRescheduleOnly && (
              <label className="text-sm text-slate-700">
                Name
                <input value={appointmentForm.customer_name} onChange={(e) => setAppointmentForm((p) => ({ ...p, customer_name: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
              </label>
              )}

              {!showRescheduleOnly && (
              <label className="text-sm text-slate-700">
                Email address
                <input type="email" value={appointmentForm.customer_email} onChange={(e) => setAppointmentForm((p) => ({ ...p, customer_email: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
              </label>
              )}

              {!showRescheduleOnly && (
              <label className="text-sm text-slate-700">
                Country code
                <select value={appointmentForm.phone_country_code} onChange={(e) => setAppointmentForm((p) => ({ ...p, phone_country_code: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2">
                  {COUNTRY_CODE_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code}>{item.label}</option>
                  ))}
                </select>
              </label>
              )}

              {!showRescheduleOnly && (
              <label className="text-sm text-slate-700">
                Phone number
                <input value={appointmentForm.phone_local} onChange={(e) => setAppointmentForm((p) => ({ ...p, phone_local: e.target.value }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
                {invalidLocalPhone && <p className="mt-1 text-xs text-red-600">Enter 6-14 digits (spaces and dashes are allowed).</p>}
              </label>
              )}

              {!showRescheduleOnly && (
              <label className="text-sm text-slate-700">
                Service
                <select value={appointmentForm.service_id} onChange={(e) => setAppointmentForm((p) => ({ ...p, service_id: e.target.value, start_time: '', person_count: 1 }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2">
                  <option value="">Select service</option>
                  {serviceOptions.map((service) => (
                    <option key={service.id} value={service.id}>{service.name}</option>
                  ))}
                </select>
              </label>
              )}

              <label className="text-sm text-slate-700">
                Date
                <input type="date" min={editingBooking ? undefined : todayDateKey} value={appointmentForm.date} onChange={(e) => setAppointmentForm((p) => ({ ...p, date: e.target.value, start_time: p.manual_override ? p.start_time : '' }))} className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
              </label>

              {!showRescheduleOnly && (
              <label className="text-sm text-slate-700 md:col-span-2">
                Tags
                <input
                  value={appointmentForm.tags}
                  onChange={(e) => setAppointmentForm((p) => ({ ...p, tags: e.target.value }))}
                  placeholder="vip, follow-up, awaiting-docs"
                  className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
                />
                <p className="mt-1 text-xs text-slate-400">Comma-separated internal tags.</p>
              </label>
              )}

              {!editingBooking && !showRescheduleOnly && (
                <label className="text-sm text-slate-700 md:col-span-2">
                  <span className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={appointmentForm.manual_override}
                      onChange={(e) => setAppointmentForm((p) => ({
                        ...p,
                        manual_override: e.target.checked,
                        start_time: '',
                        end_time: '',
                      }))}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    Manual override (set custom start and end time)
                  </span>
                </label>
              )}

              {appointmentForm.manual_override && (
                <>
                  <div className="md:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Manual override uses your local browser time zone. Set the exact start and end time you want saved.
                  </div>

                  <label className="text-sm text-slate-700">
                    Start time
                    <input
                      type="time"
                      value={appointmentForm.start_time}
                      onChange={(e) => setAppointmentForm((p) => ({ ...p, start_time: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
                    />
                  </label>

                  <label className="text-sm text-slate-700">
                    End time
                    <input
                      type="time"
                      value={appointmentForm.end_time}
                      onChange={(e) => setAppointmentForm((p) => ({ ...p, end_time: e.target.value }))}
                      className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
                    />
                    {manualOverrideWarning && (
                      <p className="mt-1 text-xs font-medium text-amber-700">{manualOverrideWarning}</p>
                    )}
                  </label>
                </>
              )}

              {!showRescheduleOnly && (
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowNotesEditor((prev) => !prev)}
                  className="ui-tap ui-focus inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  <PencilIcon className="h-4 w-4" />
                  {showNotesEditor ? 'Hide notes' : (appointmentForm.notes.trim() ? 'Show notes' : 'Add notes')}
                </button>
                {showNotesEditor && (
                  <label className="mt-2 block text-sm text-slate-700">
                    Notes
                    <textarea
                      value={appointmentForm.notes}
                      onChange={(e) => setAppointmentForm((p) => ({ ...p, notes: e.target.value }))}
                      rows={3}
                      placeholder="Optional internal note for this appointment"
                      className="mt-1 w-full border border-slate-300 rounded px-3 py-2"
                    />
                    {editingBooking && (
                      <p className="mt-1 text-xs text-slate-500">
                        Notes autosave while you type.
                        {notesAutosaveState === 'saving' && ' Saving...'}
                        {notesAutosaveState === 'saved' && ' Saved'}
                        {notesAutosaveState === 'error' && ' Save failed. Please click Save Changes.'}
                      </p>
                    )}
                  </label>
                )}
              </div>
              )}
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

            {!appointmentForm.manual_override && (() => {
              const svc = serviceOptions.find((s) => s.id === appointmentForm.service_id)
              const modalDuration = svc
                ? svc.duration_minutes + getServicePersonUnits(svc, appointmentForm.person_count) * svc.duration_per_additional_person_minutes
                : 30
              const dateBookings = allActiveBookings.filter((b) => b.start_time.startsWith(appointmentForm.date))
              return (
                <div className="text-sm text-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Select appointment time</span>
                    <div className="flex items-center gap-2">
                      {availableSlots.length > 0 && !loadingSlots && (
                        <button
                          type="button"
                          onClick={() => setAppointmentForm((p) => ({ ...p, start_time: availableSlots[0].isoString }))}
                          className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                        >
                          First available: {availableSlots[0].time}
                        </button>
                      )}
                      <span className="text-xs text-slate-400">Click the timeline to pick a start time</span>
                    </div>
                  </div>
                  {loadingSlots ? (
                    <div className="h-80 rounded-lg border border-slate-200 bg-slate-50 flex flex-col items-center justify-center gap-2 text-slate-400 text-sm">
                      <svg className="animate-spin h-5 w-5 text-indigo-400" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Checking availability…
                    </div>
                  ) : slotsError ? (
                    <div className="h-80 rounded-lg border border-amber-200 bg-amber-50 flex flex-col items-center justify-center gap-3 text-amber-700 text-sm px-4 text-center">
                      <span className="text-lg">⚠</span>
                      <p>{slotsError}</p>
                      {!editingBooking && (
                        <button
                          type="button"
                          onClick={() => setShowWaitlistModal(true)}
                          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800"
                        >
                          Add to waitlist instead
                        </button>
                      )}
                    </div>
                  ) : !appointmentForm.date || !appointmentForm.service_id ? (
                    <div className="h-80 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400 text-sm">Select a service and date to see the timeline.</div>
                  ) : (
                    <div className="space-y-3">
                      <SlotTimeline
                        date={appointmentForm.date}
                        availableSlots={availableSlots}
                        existingBookings={dateBookings}
                        selectedIso={appointmentForm.start_time}
                        durationMinutes={modalDuration}
                        onBookingClick={openEditBooking}
                        onSelect={(iso) => setAppointmentForm((p) => ({ ...p, start_time: iso }))}
                      />
                      {availableSlots.length === 0 && !editingBooking && (
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => setShowWaitlistModal(true)}
                            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"
                          >
                            No slot works, add customer to waitlist
                          </button>
                        </div>
                      )}
                    </div>
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
                  {editingBooking && <p className="mt-1 text-xs text-slate-500">Tip: use the quick reschedule chips above or click a new time on the timeline.</p>}
                </div>
              )
            })()}

            {appointmentForm.manual_override && (
              <div className="space-y-3">
                <div className="text-sm text-slate-700 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
                  <p className="font-medium text-indigo-700">Manual override enabled</p>
                  <p className="mt-1 text-xs text-indigo-600">Existing appointments for this date are shown below to avoid accidental double booking.</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Existing appointments on {appointmentForm.date || 'selected date'}
                  </div>
                  {!appointmentForm.date ? (
                    <div className="px-3 py-3 text-xs text-slate-500">Pick a date to view existing appointments.</div>
                  ) : (
                    (() => {
                      const existing = allActiveBookings
                        .filter((booking) => booking.start_time.startsWith(appointmentForm.date))
                        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

                      if (existing.length === 0) {
                        return <div className="px-3 py-3 text-xs text-emerald-700">No existing appointments for this date.</div>
                      }

                      return (
                        <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                          {existing.map((booking) => (
                            <button
                              key={booking.id}
                              type="button"
                              onClick={() => openEditBooking(booking)}
                              className="w-full px-3 py-2 text-left hover:bg-slate-50"
                            >
                              <p className="text-xs font-semibold text-slate-700">{formatTime(booking.start_time)} - {formatTime(booking.end_time)} · {booking.customer_name}</p>
                              <p className="mt-0.5 text-[11px] text-slate-500">{booking.booking_services?.name || 'Service'} · {booking.status}</p>
                            </button>
                          ))}
                        </div>
                      )
                    })()
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {cancelConfirmOpen && editingBooking && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <span className="flex-1 font-medium">Cancel this appointment?</span>
                  <button
                    onClick={cancelEditingBooking}
                    disabled={updatingId === editingBooking.id}
                    className="px-3 py-1 rounded bg-red-600 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    {updatingId === editingBooking.id ? 'Cancelling…' : 'Yes, cancel it'}
                  </button>
                  <button
                    onClick={() => setCancelConfirmOpen(false)}
                    className="px-3 py-1 rounded border border-red-300 text-xs font-medium bg-white"
                  >
                    Never mind
                  </button>
                </div>
              )}
              <div className="sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-col gap-2 border-t border-slate-100 bg-white/95 px-4 py-3 backdrop-blur md:static md:m-0 md:flex-row md:items-center md:justify-end md:border-t-0 md:bg-transparent md:p-0">
                {editingBooking && (
                  <button
                    onClick={() => setHistoryBookingId(editingBooking.id)}
                    className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 md:min-h-0 md:w-auto"
                  >
                    History
                  </button>
                )}
                {editingBooking && (
                  <button
                    onClick={() => void resendBookingEmail(editingBooking)}
                    disabled={resendingBookingId === editingBooking.id}
                    className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm text-indigo-700 disabled:opacity-50 md:min-h-0 md:w-auto"
                  >
                    {resendingBookingId === editingBooking.id ? 'Re-sending…' : 'Re-send Email'}
                  </button>
                )}
                {editingBooking && (editingBooking.status === BookingStatus.PENDING || editingBooking.status === BookingStatus.CONFIRMED) && !cancelConfirmOpen && (
                  <button
                    onClick={() => setCancelConfirmOpen(true)}
                    disabled={savingBooking || updatingId === editingBooking.id}
                    className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 disabled:opacity-50 md:min-h-0 md:w-auto"
                  >
                    <CloseIcon className="h-4 w-4" />
                    Cancel Appointment
                  </button>
                )}
                <button onClick={closeAppointmentModal} className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded border border-slate-300 px-4 py-2 text-sm md:min-h-0 md:w-auto"><CloseIcon className="h-4 w-4" />Close</button>
                <button onClick={saveAppointment} disabled={savingBooking || invalidLocalPhone} className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50 md:min-h-0 md:w-auto">
                  {!savingBooking && <CheckIcon className="h-4 w-4" />}
                  {savingBooking ? 'Saving...' : editingBooking ? 'Save Changes' : 'Create Appointment'}
                </button>
                {editingBooking && editingBooking.status !== BookingStatus.CANCELLED && (
                  <button onClick={() => void flagNoShow(editingBooking)} disabled={updatingId === editingBooking.id} className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700 disabled:opacity-50 md:min-h-0 md:w-auto">
                    Flag No-Show
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <BookingWaitlistModal
        isOpen={showWaitlistModal}
        locationId={selectedLocationId}
        serviceOptions={serviceOptions.map((service) => ({ id: service.id, name: service.name }))}
        initialServiceId={appointmentForm.service_id}
        initialDate={appointmentForm.date}
        onClose={() => setShowWaitlistModal(false)}
        onCreated={fetchWaitlist}
      />

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

      <BookingHistoryModal
        bookingId={historyBookingId}
        isOpen={Boolean(historyBookingId)}
        onClose={() => setHistoryBookingId(null)}
      />
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
          {loading ? 'Loading…' : `${selectedDateCount} appointment${selectedDateCount !== 1 ? 's' : ''}`}
        </span>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm">Loading appointments…</div>
      ) : selectedBookings.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8">
            <p className="text-base font-semibold text-slate-700">No appointments on this day</p>
            <p className="mt-2 text-sm text-slate-400">Use the agenda or click directly in the week timeline to create the next booking.</p>
          </div>
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
      <div className="w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-[0_28px_90px_-36px_rgba(15,23,42,0.5)]">
        <div className="flex items-center justify-between border-b border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#eef2ff_100%)] px-5 py-4">
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
          <div className="border-r border-slate-200 p-5 bg-white">
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
                <div className="rounded-xl border border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] px-3 py-2 shadow-sm">
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
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/30 hover:shadow-md"
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

          <div className="bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] p-5 max-h-[70vh] overflow-y-auto">
            <div className="mb-4 sticky top-0 z-10 bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)] pb-3">
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
              <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 shadow-sm">
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
                <p className="text-sm text-slate-500">No available times for this day. Try another service, reduce person count, or choose a different date.</p>
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
                        <span className="block text-base font-semibold text-slate-800">{slot.time}</span>
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

function WeekTimeline({
  weekDays,
  activeBookings,
  conflictBookings,
  today,
  loading,
  mobileDayIndex,
  onSlotClick,
  onBookingClick,
  onReschedule,
  onStatusChange,
}: {
  weekDays: Date[]
  activeBookings: BookingWithService[]
  conflictBookings: BookingWithService[]
  today: Date
  loading: boolean
  mobileDayIndex: number
  onSlotClick: (dateKey: string, startIso: string) => void
  onBookingClick: (booking: BookingWithService) => void
  onReschedule: (id: string, newStartIso: string) => void
  onStatusChange: (id: string, status: string) => void
}) {
  const TIMELINE_START = TIMELINE_START_HOUR * 60
  const TIMELINE_END   = TIMELINE_END_HOUR   * 60
  const totalHeight    = (TIMELINE_END - TIMELINE_START) * TIMELINE_PX_PER_MIN
  const containerRef   = useRef<HTMLDivElement>(null)
  const lastAutoScrollWeekRef = useRef<string | null>(null)
  const LABEL_W        = 48

  const hours: number[] = []
  for (let h = TIMELINE_START_HOUR; h <= TIMELINE_END_HOUR; h++) hours.push(h)
  const yFor = useCallback(
    (mins: number) => (mins - TIMELINE_START) * TIMELINE_PX_PER_MIN,
    [TIMELINE_START],
  )
  const [currentUtcMinutes, setCurrentUtcMinutes] = useState(() => {
    const now = new Date()
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  })

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date()
      setCurrentUtcMinutes(now.getUTCHours() * 60 + now.getUTCMinutes())
    }, 60000)
    return () => clearInterval(id)
  }, [])

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, BookingWithService[]>()
    for (const b of activeBookings) {
      const dateKey = new Date(b.start_time).toISOString().slice(0, 10)
      const arr = map.get(dateKey) ?? []
      arr.push(b)
      map.set(dateKey, arr)
    }
    return map
  }, [activeBookings])

  const conflictBookingsByDate = useMemo(() => {
    const map = new Map<string, BookingWithService[]>()
    for (const b of conflictBookings) {
      const dateKey = new Date(b.start_time).toISOString().slice(0, 10)
      const arr = map.get(dateKey) ?? []
      arr.push(b)
      map.set(dateKey, arr)
    }
    return map
  }, [conflictBookings])

  useEffect(() => {
    if (!containerRef.current) return
    const weekKey = `${weekDays[0]?.toISOString() ?? ''}|${weekDays[6]?.toISOString() ?? ''}`
    if (lastAutoScrollWeekRef.current === weekKey) return
    lastAutoScrollWeekRef.current = weekKey

    const includesToday = weekDays.some((day) => isSameUTCDay(day, today))
    if (!includesToday) {
      containerRef.current.scrollTop = 0
      return
    }

    const now = new Date()
    const currentMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
    const target = Math.max(TIMELINE_START, Math.min(TIMELINE_END, currentMinutes))
    containerRef.current.scrollTop = Math.max(0, yFor(target) - 160)
  }, [TIMELINE_END, TIMELINE_START, today, weekDays, yFor])

  // ── Drag-to-reschedule ────────────────────────────────────────────────────
  const [dragging, setDragging] = useState<{
    booking: BookingWithService
    durMin: number
    blockOffsetY: number
  } | null>(null)
  const [dragOver, setDragOver] = useState<{ colIdx: number; startMin: number } | null>(null)
  const dragMovedRef = useRef(false)

  const handleDragStart = useCallback((
    e: React.MouseEvent,
    b: BookingWithService,
    dayStartMs: number,
  ) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const startMs  = new Date(b.start_time).getTime()
    const durMin   = Math.max((new Date(b.end_time).getTime() - startMs) / 60000, 5)
    const startMin = (startMs - dayStartMs) / 60000
    const rect     = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const scrollTop    = containerRef.current?.scrollTop ?? 0
    const clickedY     = e.clientY - rect.top + scrollTop
    const blockTop     = (startMin - TIMELINE_START_HOUR * 60) * TIMELINE_PX_PER_MIN
    const blockOffsetY = Math.max(0, clickedY - blockTop)
    dragMovedRef.current = false
    setDragging({ booking: b, durMin, blockOffsetY })
  }, [])

  const handleDragMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return
    dragMovedRef.current = true
    const rect      = containerRef.current.getBoundingClientRect()
    const scrollTop = containerRef.current.scrollTop
    const y         = e.clientY - rect.top + scrollTop - dragging.blockOffsetY
    const rawMin    = TIMELINE_START_HOUR * 60 + y / TIMELINE_PX_PER_MIN
    const snapped   = Math.round(rawMin / 5) * 5
    const clamped   = Math.max(TIMELINE_START_HOUR * 60, Math.min(TIMELINE_END_HOUR * 60 - dragging.durMin, snapped))
    const bodyX     = e.clientX - rect.left - LABEL_W
    const colWidth  = (rect.width - LABEL_W) / weekDays.length
    const colIdx    = Math.max(0, Math.min(weekDays.length - 1, Math.floor(bodyX / colWidth)))
    setDragOver({ colIdx, startMin: clamped })
  }, [dragging, weekDays.length])

  const handleDragEnd = useCallback(() => {
    const moved = dragMovedRef.current
    if (!dragging || !dragOver || !moved) {
      setDragging(null)
      setDragOver(null)
      return
    }
    const newDate = weekDays[dragOver.colIdx]
    const isPast  = newDate.getTime() < today.getTime() && !isSameUTCDay(newDate, today)
    if (!isPast) {
      const newStartIso = new Date(newDate.getTime() + dragOver.startMin * 60000).toISOString()
      if (newStartIso !== dragging.booking.start_time) {
        onReschedule(dragging.booking.id, newStartIso)
      }
    }
    setDragging(null)
    setDragOver(null)
  }, [dragging, dragOver, weekDays, today, onReschedule])

  const dragConflict = useMemo(() => {
    if (!dragging || !dragOver) return false
    const targetDay = weekDays[dragOver.colIdx]
    if (!targetDay) return false
    const targetDateKey = targetDay.toISOString().slice(0, 10)
    const targetBookings = conflictBookingsByDate.get(targetDateKey) ?? []
    const dragStartMs = targetDay.getTime() + dragOver.startMin * 60000
    const dragEndMs = dragStartMs + dragging.durMin * 60000

    return targetBookings.some((booking) => {
      if (booking.id === dragging.booking.id) return false
      const bookingStartMs = new Date(booking.start_time).getTime()
      const bookingEndMs = new Date(booking.end_time).getTime()
      return dragStartMs < bookingEndMs && dragEndMs > bookingStartMs
    })
  }, [conflictBookingsByDate, dragOver, dragging, weekDays])

  // ── Right-click status context menu ──────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{
    booking: BookingWithService
    x: number
    y: number
  } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [contextMenu])

  const statusActions = [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.CANCELLED]
  const mobileDay = weekDays[mobileDayIndex] ?? weekDays[0]
  const mobileDateKey = mobileDay?.toISOString().slice(0, 10) ?? ''
  const mobileBookings = mobileDateKey ? bookingsByDate.get(mobileDateKey) ?? [] : []
  const hasCurrentTimeInRange = currentUtcMinutes >= TIMELINE_START && currentUtcMinutes <= TIMELINE_END
  const currentLineTop = yFor(Math.max(TIMELINE_START, Math.min(TIMELINE_END, currentUtcMinutes)))
  const scrollToNow = useCallback(() => {
    if (!containerRef.current) return
    const now = new Date()
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes()
    const target = Math.max(TIMELINE_START, Math.min(TIMELINE_END, mins))
    containerRef.current.scrollTop = Math.max(0, yFor(target) - 160)
  }, [TIMELINE_END, TIMELINE_START, yFor])

  return (
    <>
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] select-none md:hidden">
      {mobileDay && (
        <>
          <div className="border-b border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#eef2ff_100%)] px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{DAY_LABELS[mobileDay.getUTCDay()]}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p className="text-xl font-bold text-slate-800">{formatDateLabel(mobileDay)}</p>
                    {isSameUTCDay(mobileDay, today) && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">Today</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={scrollToNow}
                  className="ui-tap ui-focus rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Back to now
                </button>
            </div>
          </div>

          <div
            ref={containerRef}
            className={`overflow-y-scroll overflow-x-hidden bg-[linear-gradient(180deg,_rgba(248,250,252,0.75)_0%,_rgba(255,255,255,1)_18%)] ${dragging ? 'cursor-grabbing' : ''}`}
            style={{ height: 560 }}
            onMouseMove={handleDragMove}
            onMouseUp={handleDragEnd}
            onMouseLeave={handleDragEnd}
          >
            <div className="flex" style={{ height: totalHeight }}>
              <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="relative flex-shrink-0">
                {hours.map((h) => (
                  <div key={`mobile-${h}`} className="absolute right-2 text-[10px] font-medium text-slate-400 text-right leading-none" style={{ top: yFor(h * 60) - 5 }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="relative flex-1 border-l border-slate-200 bg-white/90">
                  {hours.map((h) => (
                    <div key={`mh-${h}`} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: yFor(h * 60) }} />
                  ))}
                  {[0.15, 0.42, 0.7].map((frac, index) => (
                    <div key={index} className="absolute left-0.5 right-0.5 rounded bg-slate-200 animate-pulse" style={{ top: totalHeight * frac, height: 36 + index * 18 }} />
                  ))}
                </div>
              ) : (
                <div
                  className={`relative flex-1 border-l border-slate-200 ${isSameUTCDay(mobileDay, today) ? 'bg-indigo-50/30' : 'bg-white'} ${dragging ? 'cursor-default' : 'cursor-pointer hover:bg-indigo-50/20'}`}
                  onClick={(e) => {
                    if (dragMovedRef.current) { dragMovedRef.current = false; return }
                    const rect = e.currentTarget.getBoundingClientRect()
                    const clickedY = (e.clientY - rect.top) + (containerRef.current?.scrollTop ?? 0)
                    const clickedMin = TIMELINE_START + clickedY / TIMELINE_PX_PER_MIN
                    const roundedMin = Math.round(clickedMin / 5) * 5
                    const clampedMin = Math.max(TIMELINE_START, Math.min(TIMELINE_END - 30, roundedMin))
                    const startIso = new Date(mobileDay.getTime() + clampedMin * 60000).toISOString()
                    onSlotClick(mobileDateKey, startIso)
                  }}
                >
                  {hours.map((h) => (
                    <div key={`mg-${h}`} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: yFor(h * 60) }} />
                  ))}
                  {hours.map((h) => (
                    <div key={`mgh-${h}`} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ top: yFor(h * 60 + 30) }} />
                  ))}

                  {isSameUTCDay(mobileDay, today) && hasCurrentTimeInRange && (
                    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: currentLineTop }}>
                      <div className="h-0 border-t-2 border-rose-500" />
                      <span className="absolute right-1 -top-3 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-semibold text-white animate-pulse">Now</span>
                    </div>
                  )}

                  {mobileBookings.map((b) => {
                    const startMs = new Date(b.start_time).getTime()
                    const endMs = new Date(b.end_time).getTime()
                    const startMin = (startMs - mobileDay.getTime()) / 60000
                    const durMin = Math.max((endMs - startMs) / 60000, 5)
                    const top = yFor(startMin)
                    const height = Math.max(durMin * TIMELINE_PX_PER_MIN, 22)
                    const colors = WEEK_BLOCK_COLORS[b.status] ?? WEEK_BLOCK_COLORS.pending
                    const isPending = b.status === BookingStatus.PENDING
                    return (
                      <div
                        key={`mobile-booking-${b.id}`}
                        className={`absolute left-1 right-1 rounded-xl px-2 py-1 overflow-hidden shadow-sm ring-1 ring-black/5 ${colors.bg} ${colors.hover}`}
                        style={{ top, height }}
                        onClick={(e) => {
                          e.stopPropagation()
                          onBookingClick(b)
                        }}
                      >
                        <p className={`text-[10px] font-bold truncate ${isPending ? 'text-slate-900' : 'text-white'}`}>{formatTime(b.start_time)} · {b.customer_name}</p>
                        {height >= 42 && <p className={`text-[9px] truncate ${isPending ? 'text-slate-700' : 'text-white/80'}`}>{b.booking_services?.name || 'Service'}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>

    <div className="hidden overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_50px_-32px_rgba(15,23,42,0.35)] select-none md:block">
      {/* Day header row */}
      <div className="flex border-b border-slate-200 bg-[linear-gradient(180deg,_#ffffff_0%,_#eef2ff_100%)]">
        <div style={{ width: LABEL_W, minWidth: LABEL_W }} />
        {weekDays.map((day) => {
          const isToday = isSameUTCDay(day, today)
          const isPast  = day.getTime() < today.getTime() && !isToday
          const count   = bookingsByDate.get(day.toISOString().slice(0, 10))?.length ?? 0
          return (
            <div
              key={day.toISOString()}
              className={`flex-1 text-center py-2 border-l border-slate-200 ${isToday ? 'bg-indigo-50' : ''}`}
            >
              <p className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? 'text-indigo-500' : isPast ? 'text-slate-400' : 'text-slate-500'}`}>
                {DAY_LABELS[day.getUTCDay()]}
              </p>
              <p className={`text-xl font-bold leading-tight ${isToday ? 'text-indigo-600' : isPast ? 'text-slate-400' : 'text-slate-700'}`}>
                {day.getUTCDate()}
              </p>
              {count > 0 && (
                <span className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full mt-0.5 ${isToday ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                  {count}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Scrollable body */}
      <div
        ref={containerRef}
        className={`overflow-y-scroll overflow-x-hidden bg-[linear-gradient(180deg,_rgba(248,250,252,0.75)_0%,_rgba(255,255,255,1)_18%)] ${dragging ? 'cursor-grabbing' : ''}`}
        style={{ height: 560 }}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
      >
        <div className="flex" style={{ height: totalHeight }}>
          {/* Hour labels */}
          <div style={{ width: LABEL_W, minWidth: LABEL_W }} className="relative flex-shrink-0">
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-2 text-[10px] font-medium text-slate-400 text-right leading-none"
                style={{ top: yFor(h * 60) - 5 }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {loading
            ? weekDays.map((day) => (
                <div key={day.toISOString()} className="relative flex-1 border-l border-slate-200 bg-white/90">
                  {hours.map((h) => (
                    <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: yFor(h * 60) }} />
                  ))}
                  {[0.15, 0.42, 0.70].map((frac, i) => (
                    <div
                      key={i}
                      className="absolute left-0.5 right-0.5 rounded bg-slate-200 animate-pulse"
                      style={{ top: totalHeight * frac, height: 32 + i * 20 }}
                    />
                  ))}
                </div>
              ))
            : weekDays.map((day, colIdx) => {
                const dateKey     = day.toISOString().slice(0, 10)
                const dayStartMs  = day.getTime()
                const isToday     = isSameUTCDay(day, today)
                const isPast      = day.getTime() < today.getTime() && !isToday
                const dayBookings = bookingsByDate.get(dateKey) ?? []
                return (
                  <div
                    key={dateKey}
                    className={`relative flex-1 border-l border-slate-200 transition-colors ${
                      isToday ? 'bg-indigo-50/30' : isPast ? 'bg-slate-50/70' : 'bg-white'
                    } ${isPast || dragging ? 'cursor-default' : 'cursor-pointer hover:bg-indigo-50/20'}`}
                    onClick={(e) => {
                      if (isPast) return
                      if (dragMovedRef.current) { dragMovedRef.current = false; return }
                      const rect       = e.currentTarget.getBoundingClientRect()
                      const clickedY   = (e.clientY - rect.top) + (containerRef.current?.scrollTop ?? 0)
                      const clickedMin = TIMELINE_START + clickedY / TIMELINE_PX_PER_MIN
                      const roundedMin = Math.round(clickedMin / 5) * 5
                      const clampedMin = Math.max(TIMELINE_START, Math.min(TIMELINE_END - 30, roundedMin))
                      const startIso   = new Date(dayStartMs + clampedMin * 60000).toISOString()
                      onSlotClick(dateKey, startIso)
                    }}
                  >
                    {hours.map((h) => (
                      <div key={h} className="absolute left-0 right-0 border-t border-slate-100" style={{ top: yFor(h * 60) }} />
                    ))}
                    {hours.map((h) => (
                      <div key={`hf-${h}`} className="absolute left-0 right-0 border-t border-dashed border-slate-100" style={{ top: yFor(h * 60 + 30) }} />
                    ))}

                    {isToday && hasCurrentTimeInRange && (
                      <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: currentLineTop }}>
                        <div className="h-0 border-t-2 border-rose-500" />
                        <span className="absolute right-1 -top-3 rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-semibold text-white animate-pulse">Now</span>
                      </div>
                    )}

                    {dayBookings.map((b) => {
                      const startMs    = new Date(b.start_time).getTime()
                      const endMs      = new Date(b.end_time).getTime()
                      const startMin   = (startMs - dayStartMs) / 60000
                      const durMin     = Math.max((endMs - startMs) / 60000, 5)
                      const top        = yFor(startMin)
                      const height     = Math.max(durMin * TIMELINE_PX_PER_MIN, 22)
                      const colors     = WEEK_BLOCK_COLORS[b.status] ?? WEEK_BLOCK_COLORS.pending
                      const statusA11y = STATUS_ACCESSIBILITY[b.status] ?? STATUS_ACCESSIBILITY.pending
                      const isPending  = b.status === BookingStatus.PENDING
                      const isDragging = dragging?.booking.id === b.id
                      return (
                        <div
                          key={b.id}
                          className={`absolute left-0.5 right-0.5 rounded-xl px-1.5 overflow-hidden z-10 shadow-sm ring-1 ring-black/5 transition-opacity ${colors.bg} ${
                            isDragging ? 'opacity-30 cursor-grabbing' : `${colors.hover} cursor-grab`
                          }`}
                          style={{ top, height }}
                          onMouseDown={(e) => { handleDragStart(e, b, dayStartMs) }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (dragMovedRef.current) { dragMovedRef.current = false; return }
                            onBookingClick(b)
                          }}
                          onContextMenu={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setContextMenu({ booking: b, x: e.clientX, y: e.clientY })
                          }}
                        >
                          <div className="flex items-start justify-between gap-1 pt-0.5">
                            <p className={`text-[9px] font-bold truncate leading-tight ${isPending ? 'text-slate-900' : 'text-white'}`}>
                              {formatTime(b.start_time)}
                            </p>
                            {height >= 28 && (
                              <span className={`rounded border px-1 py-0.5 text-[8px] font-bold leading-none ${isPending ? 'border-black/20 bg-black/10 text-slate-900' : 'border-white/60 bg-white/15 text-white'}`}>
                                {statusA11y.short}
                              </span>
                            )}
                          </div>
                          <p className={`text-[9px] truncate ${isPending ? 'text-slate-800' : 'text-white/90'}`}>{b.customer_name}</p>
                          {height >= 42 && b.booking_services?.name && (
                            <p className={`text-[8px] truncate ${isPending ? 'text-slate-700' : 'text-white/70'}`}>{b.booking_services.name}</p>
                          )}
                        </div>
                      )
                    })}

                    {/* Drag ghost */}
                    {dragging && dragOver?.colIdx === colIdx && (() => {
                      const ghostTop    = yFor(dragOver.startMin)
                      const ghostHeight = Math.max(dragging.durMin * TIMELINE_PX_PER_MIN, 22)
                      const hh = String(Math.floor(dragOver.startMin / 60)).padStart(2, '0')
                      const mm = String(dragOver.startMin % 60).padStart(2, '0')
                      return (
                        <div
                          className={`absolute left-0.5 right-0.5 rounded border-2 border-dashed z-20 pointer-events-none ${
                            dragConflict
                              ? 'border-red-500 bg-red-100/75'
                              : 'border-indigo-500 bg-indigo-100/70'
                          }`}
                          style={{ top: ghostTop, height: ghostHeight }}
                        >
                          <p className={`text-[9px] font-semibold px-1.5 pt-0.5 ${dragConflict ? 'text-red-700' : 'text-indigo-700'}`}>
                            {hh}:{mm}{dragConflict ? ' conflict' : ''}
                          </p>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-3 border-t border-slate-100 bg-[linear-gradient(180deg,_#ffffff_0%,_#f8fafc_100%)] text-[10px] text-slate-500 flex-wrap">
        {Object.entries(WEEK_BLOCK_COLORS).map(([status, colors]) => (
          <span key={status} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded-sm ${colors.bg}`} />
            <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-bold ${STATUS_ACCESSIBILITY[status]?.pill ?? STATUS_ACCESSIBILITY.pending.pill}`}>
              {STATUS_ACCESSIBILITY[status]?.short ?? STATUS_ACCESSIBILITY.pending.short}
            </span>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        ))}
        <button
          type="button"
          onClick={scrollToNow}
          className="ui-tap ui-focus rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to now
        </button>
        <span className="italic text-slate-400">Click to book · Drag to reschedule · Red ghost means overlap · Right-click for status</span>
      </div>

      {/* Right-click status context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-slate-200 py-1 min-w-[168px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-100">
            Change status
          </p>
          {statusActions
            .filter((s) => s !== contextMenu.booking.status)
            .map((status) => (
              <button
                key={status}
                className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                onClick={() => {
                  onStatusChange(contextMenu.booking.id, status)
                  setContextMenu(null)
                }}
              >
                Mark as {status}
              </button>
            ))}
        </div>
      )}
    </div>
    </>
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
  onBookingClick,
  onSelect,
}: {
  date: string
  availableSlots: SlotOption[]
  existingBookings: BookingWithService[]
  selectedIso: string
  durationMinutes: number
  onBookingClick?: (booking: BookingWithService) => void
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
          booking: b,
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

  const yFor = useCallback(
    (mins: number) => (mins - TIMELINE_START) * TIMELINE_PX_PER_MIN,
    [TIMELINE_START],
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
    [availableSlots, onSelect, TIMELINE_START],
  )

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
                    <button
                      type="button"
                      key={b.id}
                      className="absolute left-1 right-1 rounded bg-indigo-500 px-2 overflow-hidden z-10 shadow-sm ring-1 ring-indigo-300/30 hover:bg-indigo-600"
                      style={{ top, height }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onBookingClick?.(b.booking)
                      }}
                      title="Click to open edit / reschedule"
                    >
                      <div className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white/80" />
                      <p className="text-[10px] font-semibold text-white truncate leading-tight pt-0.5">{b.name}</p>
                      {b.service && <p className="text-[9px] text-indigo-200 truncate">{b.service}</p>}
                    </button>
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

const BookingRow = memo(function BookingRow({
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
                  <span className="text-xs font-medium text-indigo-600">x{booking.person_count}</span>
                </>
              )}
              <span className="text-slate-300">·</span>
              <span className="text-xs text-slate-400">{booking.booking_services.duration_minutes} min</span>
            </>
          )}
        </div>
        {booking.notes && (
          <p className="mt-2 line-clamp-2 text-xs text-slate-500">{booking.notes}</p>
        )}
        {booking.tags && booking.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {booking.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                {tag}
              </span>
            ))}
          </div>
        )}
        {booking.last_email_status && (
          <p className="mt-2 text-[11px] text-slate-400">
            Last email: {booking.last_email_status}
            {booking.last_email_sent_at ? ` · ${new Date(booking.last_email_sent_at).toLocaleString('en-GB')}` : ''}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.text}`}>
          <span className="mr-1 inline-flex h-4 min-w-4 items-center justify-center rounded border border-current/20 bg-white/60 px-1 text-[10px] font-bold leading-none">
            {statusA11y.short}
          </span>
          {status.label}
        </span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${sourceClass} capitalize`}>
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
        {(booking.status === BookingStatus.PENDING || booking.status === BookingStatus.CONFIRMED) && (
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
