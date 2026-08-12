import { BookingStatus, type BookingSource } from '@/app/types/bookings'

export interface BookingWithService {
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

export interface BookingServiceOption {
  id: string
  name: string
  is_active: boolean
  duration_minutes: number
  buffer_minutes: number
  duration_per_additional_person_minutes: number
  person_count_excludes_family_head?: boolean
  close_overrun_tolerance_minutes?: number
}

export interface SlotOption {
  time: string
  isoString: string
}

export interface SlotLoadResult {
  slots: SlotOption[]
  error: string | null
}

export const COUNTRY_CODE_OPTIONS = [
  ['+93', 'Afghanistan'],
  ['+355', 'Albania'],
  ['+213', 'Algeria'],
  ['+54', 'Argentina'],
  ['+61', 'Australia'],
  ['+43', 'Austria'],
  ['+973', 'Bahrain'],
  ['+880', 'Bangladesh'],
  ['+32', 'Belgium'],
  ['+55', 'Brazil'],
  ['+359', 'Bulgaria'],
  ['+855', 'Cambodia'],
  ['+237', 'Cameroon'],
  ['+1', 'Canada/United States'],
  ['+56', 'Chile'],
  ['+86', 'China'],
  ['+57', 'Colombia'],
  ['+385', 'Croatia'],
  ['+357', 'Cyprus'],
  ['+420', 'Czech Republic'],
  ['+45', 'Denmark'],
  ['+20', 'Egypt'],
  ['+372', 'Estonia'],
  ['+358', 'Finland'],
  ['+33', 'France'],
  ['+49', 'Germany'],
  ['+30', 'Greece'],
  ['+852', 'Hong Kong'],
  ['+36', 'Hungary'],
  ['+354', 'Iceland'],
  ['+44', 'United Kingdom'],
  ['+91', 'India'],
  ['+62', 'Indonesia'],
  ['+98', 'Iran'],
  ['+964', 'Iraq'],
  ['+353', 'Ireland'],
  ['+972', 'Israel'],
  ['+39', 'Italy'],
  ['+81', 'Japan'],
  ['+962', 'Jordan'],
  ['+7', 'Kazakhstan/Russia'],
  ['+254', 'Kenya'],
  ['+965', 'Kuwait'],
  ['+371', 'Latvia'],
  ['+961', 'Lebanon'],
  ['+370', 'Lithuania'],
  ['+60', 'Malaysia'],
  ['+356', 'Malta'],
  ['+52', 'Mexico'],
  ['+212', 'Morocco'],
  ['+31', 'Netherlands'],
  ['+64', 'New Zealand'],
  ['+234', 'Nigeria'],
  ['+47', 'Norway'],
  ['+92', 'Pakistan'],
  ['+970', 'Palestine'],
  ['+63', 'Philippines'],
  ['+48', 'Poland'],
  ['+351', 'Portugal'],
  ['+974', 'Qatar'],
  ['+40', 'Romania'],
  ['+966', 'Saudi Arabia'],
  ['+381', 'Serbia'],
  ['+65', 'Singapore'],
  ['+421', 'Slovakia'],
  ['+27', 'South Africa'],
  ['+82', 'South Korea'],
  ['+34', 'Spain'],
  ['+94', 'Sri Lanka'],
  ['+46', 'Sweden'],
  ['+41', 'Switzerland'],
  ['+886', 'Taiwan'],
  ['+66', 'Thailand'],
  ['+216', 'Tunisia'],
  ['+90', 'Turkey'],
  ['+971', 'United Arab Emirates'],
  ['+598', 'Uruguay'],
  ['+84', 'Vietnam'],
].map(([code, country]) => ({ code, label: `${country} (${code})` }))

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const CALENDAR_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Pending' },
  confirmed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Confirmed' },
  completed: { bg: 'bg-slate-100', text: 'text-slate-600', label: 'Completed' },
  cancelled: { bg: 'bg-red-100', text: 'text-red-700', label: 'Cancelled' },
}

export const WEEK_BLOCK_COLORS: Record<string, { bg: string; hover: string }> = {
  pending: { bg: 'bg-amber-400', hover: 'hover:bg-amber-500' },
  confirmed: { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600' },
  completed: { bg: 'bg-slate-400', hover: 'hover:bg-slate-500' },
  cancelled: { bg: 'bg-red-300', hover: 'hover:bg-red-400' },
}

export const SOURCE_CONFIG: Record<string, string> = {
  portal: 'bg-indigo-100 text-indigo-700',
  whatsapp: 'bg-green-100 text-green-700',
  website: 'bg-blue-100 text-blue-700',
}

export const STATUS_ACCESSIBILITY: Record<string, { short: string; pill: string }> = {
  pending: { short: 'P', pill: 'border-amber-200 bg-amber-50 text-amber-700' },
  confirmed: { short: 'C', pill: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  completed: { short: 'D', pill: 'border-slate-200 bg-slate-100 text-slate-700' },
  cancelled: { short: 'X', pill: 'border-red-200 bg-red-50 text-red-700' },
}

export function isValidLocalPhone(phone: string): boolean {
  const normalized = phone.replace(/[^\d]/g, '')
  return normalized.length >= 6 && normalized.length <= 14
}

export function normalizeLocalPhone(phone: string): string {
  return phone.replace(/[^\d]/g, '')
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - day + 1)
  return d
}

export function startOfMonth(date: Date): Date {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(1)
  return d
}

export function startOfCalendarGrid(monthStart: Date): Date {
  return startOfWeek(monthStart)
}

const dateFormat = (date: Date, options: Intl.DateTimeFormatOptions) =>
  date.toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' })

export const formatDateLabel = (date: Date) =>
  dateFormat(date, { weekday: 'short', day: 'numeric', month: 'short' })

export const formatHeaderDate = (date: Date) =>
  dateFormat(date, { day: 'numeric', month: 'long', year: 'numeric' })

export const formatLongDateLabel = (date: Date) =>
  dateFormat(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const formatMonthLabel = (date: Date) => dateFormat(date, { month: 'long', year: 'numeric' })

export function isSameUTCDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

export function formatTime(iso: string): string {
  const date = new Date(iso)
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`
}

export function getUtcMinutesOfDay(iso: string): number | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}

export function formatTimeFromMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function timeHHMMToMins(hhmm: string): number {
  const [hours, minutes] = hhmm.split(':').map(Number)
  return hours * 60 + (minutes ?? 0)
}

export function formatMinutesLabel(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

export function statusDotClass(status: BookingStatus): string {
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

export function getServicePersonUnits(
  service: BookingServiceOption | undefined,
  personCount: number,
): number {
  if (!service) return Math.max(0, personCount)
  if (service.person_count_excludes_family_head === false) return Math.max(0, personCount - 1)
  return Math.max(0, personCount)
}

export function personCountLabel(service: BookingServiceOption | undefined): string {
  if (!service) return 'Number of persons'
  return service.person_count_excludes_family_head === false
    ? 'Number of persons (including family head)'
    : 'Number of applicants (excluding family head)'
}
