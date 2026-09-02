import { ClipboardList, CreditCard, History, MessageSquarePlus, Route, Users } from 'lucide-react'
import type {
  TravelPackageAuditEvent,
  TravelPackageCommunication,
  TravelPackageDeadline,
  TravelPackagePaymentMethod,
  TravelPackagePaymentType,
  TravelPackageRiskFlag,
  TravelPackageTask,
  TravelPackageTransportVoucherData,
} from '@/app/types/packages'
import { cleanTransportVoucherVehicleLabel } from '@/lib/packageTransportVoucher'

export type WorkspaceTab =
  | 'control'
  | 'passengers'
  | 'payments'
  | 'activity'
  | 'voucher'
  | 'history'

export type OperationsResponse = {
  tasks?: TravelPackageTask[]
  deadlines?: TravelPackageDeadline[]
  risks?: TravelPackageRiskFlag[]
  communications?: TravelPackageCommunication[]
  auditEvents?: TravelPackageAuditEvent[]
  setupRequired?: boolean
  message?: string
  error?: string
}

export const TABS: Array<{ value: WorkspaceTab; label: string; icon: typeof Users }> = [
  { value: 'control', label: 'Control', icon: ClipboardList },
  { value: 'passengers', label: 'Passengers', icon: Users },
  { value: 'payments', label: 'Payments', icon: CreditCard },
  { value: 'activity', label: 'Tasks & Notes', icon: MessageSquarePlus },
  { value: 'voucher', label: 'Transport Voucher', icon: Route },
  { value: 'history', label: 'Audit', icon: History },
]

export const PASSPORT_STATUSES = [
  'not_requested',
  'requested',
  'received_whatsapp',
  'checked',
  'issues_found',
  'ready',
] as const

export const PAYMENT_METHODS: Array<{ value: TravelPackagePaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

export const PAYMENT_TYPES: Array<{ value: TravelPackagePaymentType; label: string }> = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'payment', label: 'Payment' },
  { value: 'account_credit', label: 'Previous refund / reimbursement credit' },
  { value: 'refund', label: 'Refund' },
  { value: 'chargeback', label: 'Chargeback' },
  { value: 'commission', label: 'Commission' },
]

export function dateInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export function dateTimeInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export function formatDateTime(value?: string | null) {
  if (!value) return 'Not set'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not set'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function label(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function packageStatusLabel(value: string) {
  return value === 'closed' ? 'Complete - Checked' : label(value)
}

export function employeeLabel(employee: { full_name: string | null; email?: string | null }) {
  return employee.full_name || employee.email || 'Unnamed employee'
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!text.trim()) return {} as T
  try {
    return JSON.parse(text) as T
  } catch {
    const htmlTitle = text.match(/<title>(.*?)<\/title>/i)?.[1]
    return {
      error:
        htmlTitle ||
        (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')
          ? `Unexpected server error (${response.status})`
          : text.slice(0, 240)) ||
        'Unexpected server response',
    } as T
  }
}

export function emptyVoucher(): TravelPackageTransportVoucherData {
  return {
    bookingId: '',
    adults: 0,
    children: 0,
    infants: 0,
    passengers: '',
    flightNumber: '',
    airports: '',
    landingDate: '',
    landingTime: '',
    vehicle: 'H1',
    maxBags: '6',
    extraBaggageFee: '50 SAR per bag',
    providerName: 'Barakat AlMusafar Trading',
    providerContact: '+966555049005',
    itinerary: [],
    routeAssignments: [],
    sourceTransportOptionId: '',
    sourceTransportOptionTitle: '',
    digitalVoucherUrl: '',
    qrCodeDataUrl: '',
    quoteSnapshot: {
      title: '',
      packageType: '',
      departureDate: '',
      returnDate: '',
      adults: 0,
      children: 0,
      infants: 0,
      flightTitle: '',
      makkahHotel: '',
      madinahHotel: '',
      transportOptionId: '',
      transportOptionTitle: '',
      transportProvider: '',
      routes: [],
    },
    arrivalAirport: '',
    arrivalAt: '',
    departureAirport: '',
    departureAt: '',
    makkahHotel: '',
    madinahHotel: '',
    routes: [],
    vehicleType: '',
    transportCompany: '',
    driverContact: '',
    groundManager: '',
    publicNotes: '',
    internalNotes: '',
  }
}

export const TRANSPORT_VEHICLES = [
  { name: 'Car', passengers: 4, bags: 3 },
  { name: 'H1', passengers: 6, bags: 6 },
  { name: 'Hiace', passengers: 13, bags: 13 },
  { name: 'Coaster', passengers: 18, bags: 18 },
  { name: 'Coach', passengers: 52, bags: 52 },
]

export function getVehicleCapacity(vehicle: string | undefined) {
  return TRANSPORT_VEHICLES.find((item) => item.name === vehicle)
}

export function formatVoucherPassengers(adults = 0, children = 0, infants = 0) {
  const total = Math.max(0, adults + children + infants)
  const parts = [
    `${adults} Adult${adults === 1 ? '' : 's'}`,
    `${children} Child${children === 1 ? '' : 'ren'}`,
  ]
  if (infants > 0) parts.push(`${infants} Infant${infants === 1 ? '' : 's'}`)
  return `${total} Passenger${total === 1 ? '' : 's'} (${parts.join(', ')})`
}

export function normalizeVoucherVehicleFields(
  voucherData: TravelPackageTransportVoucherData,
): TravelPackageTransportVoucherData {
  const fallbackVehicle = cleanTransportVoucherVehicleLabel(
    voucherData.vehicleType || voucherData.vehicle,
    voucherData.vehicle || '',
  )
  return {
    ...voucherData,
    vehicle: cleanTransportVoucherVehicleLabel(voucherData.vehicle, fallbackVehicle),
    vehicleType: fallbackVehicle,
    routeAssignments: (voucherData.routeAssignments || []).map((route) => ({
      ...route,
      vehicleType: cleanTransportVoucherVehicleLabel(route.vehicleType, fallbackVehicle),
    })),
  }
}
