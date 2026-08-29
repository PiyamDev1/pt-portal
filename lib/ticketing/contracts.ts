import { z } from 'zod'
import {
  TICKET_ATTRIBUTION_MAX_ASSISTANTS,
  TICKET_ATTRIBUTION_MAX_REASON_LENGTH,
  type TicketingAttributionEmployee,
} from '@/lib/ticketing/attributionContracts'

export const TICKET_PASSENGER_TYPES = ['ADT', 'YTH', 'CHD', 'INF'] as const
export const TICKET_ADMIN_REQUESTS_SUPPLIERS_API_CAPABILITY_VERSION = 2026082802
export const TICKET_YOUTH_ASSISTANCE_ARCHIVE_CAPABILITY_VERSION =
  TICKET_ADMIN_REQUESTS_SUPPLIERS_API_CAPABILITY_VERSION
export const TICKET_QUICK_ENTRY_STATUSES = ['held', 'issued'] as const
export const TICKET_DETAILS_STATUSES = ['needs_details', 'complete', 'recorded'] as const
export const TICKET_SUPPLIER_CODES = [
  'sabre_polani',
  'amadeus_piyam',
  'sabre_bt',
  'ptap',
  'airline',
] as const

function isIsoCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (![year, month, day].every(Number.isInteger)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(date.getTime())) return false
  return date.toISOString().slice(0, 10) === value
}

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine(isIsoCalendarDate, 'Use a valid date')

const localDateTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/, 'Use a valid local date and time')
  .refine((value) => {
    const [datePart, timePart = ''] = value.split('T')
    const [hours, minutes, seconds = 0] = timePart.split(':').map(Number)
    return (
      isIsoCalendarDate(datePart) &&
      hours >= 0 &&
      hours <= 23 &&
      minutes >= 0 &&
      minutes <= 59 &&
      seconds >= 0 &&
      seconds <= 59
    )
  }, 'Use a valid local date and time')

export function normalizeTicketingCustomerName(value: string) {
  const normalized = value.trim().replace(/\s+/g, ' ')
  const separatorIndex = normalized.indexOf('/')
  const orderedName =
    separatorIndex >= 0 && normalized.indexOf('/', separatorIndex + 1) < 0
      ? (() => {
          const lastName = normalized.slice(0, separatorIndex).trim()
          const firstName = normalized.slice(separatorIndex + 1).trim()
          return lastName && firstName ? `${firstName} ${lastName}` : normalized
        })()
      : normalized

  if (!/[A-Z]/.test(orderedName) || /[a-z]/.test(orderedName)) return orderedName

  return orderedName.toLowerCase().replace(/(^|[\s'-])[a-z]/g, (match) => match.toUpperCase())
}

export const ticketingQuickFareSchema = z
  .object({
    passengerType: z.enum(TICKET_PASSENGER_TYPES),
    quantity: z.number().int().min(1).max(99),
    unitSupplierCost: z.number().finite().min(0).max(99_999_999.99),
    unitSalePrice: z.number().finite().min(0).max(99_999_999.99),
    unitDiscount: z.number().finite().min(0).max(99_999_999.99),
  })
  .strict()
  .refine((fare) => fare.unitDiscount <= fare.unitSalePrice, {
    path: ['unitDiscount'],
    message: 'Discount cannot exceed the sale price',
  })

export const ticketingQuickTkSchema = z
  .object({
    customerName: z.string().trim().min(1).max(200).transform(normalizeTicketingCustomerName),
    pnr: z.string().trim().min(1).max(20),
    airlineId: z.string().uuid(),
    supplierCode: z.enum(TICKET_SUPPLIER_CODES).default('sabre_polani'),
    serviceType: z.literal('TK'),
    operationalStatus: z.enum(TICKET_QUICK_ENTRY_STATUSES),
    bookingDate: isoDateSchema,
    timeLimitAt: localDateTimeSchema.nullable(),
    issuedAt: isoDateSchema.nullable(),
    currency: z.literal('GBP'),
    fares: z.array(ticketingQuickFareSchema).min(1).max(4),
    confirmDuplicate: z.boolean().optional().default(false),
    responsibleEmployeeId: z.string().uuid().optional(),
    assistantEmployeeIds: z
      .array(z.string().uuid())
      .max(TICKET_ATTRIBUTION_MAX_ASSISTANTS)
      .optional()
      .default([]),
    attributionReason: z
      .string()
      .trim()
      .min(1)
      .max(TICKET_ATTRIBUTION_MAX_REASON_LENGTH)
      .nullable()
      .optional()
      .default(null),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.operationalStatus === 'held' && !entry.timeLimitAt) {
      context.addIssue({
        code: 'custom',
        path: ['timeLimitAt'],
        message: 'A held booking requires an airline time limit',
      })
    }

    if (entry.timeLimitAt && entry.timeLimitAt.slice(0, 10) < entry.bookingDate) {
      context.addIssue({
        code: 'custom',
        path: ['timeLimitAt'],
        message: 'Airline time limit cannot be before the booking date',
      })
    }

    if (entry.operationalStatus === 'issued' && !entry.issuedAt) {
      context.addIssue({
        code: 'custom',
        path: ['issuedAt'],
        message: 'An issued ticket requires an issued date',
      })
    }

    if (entry.issuedAt && entry.issuedAt < entry.bookingDate) {
      context.addIssue({
        code: 'custom',
        path: ['issuedAt'],
        message: 'Issued date cannot be before the booking date',
      })
    }

    const passengerTypes = entry.fares.map((fare) => fare.passengerType)
    if (new Set(passengerTypes).size !== passengerTypes.length) {
      context.addIssue({
        code: 'custom',
        path: ['fares'],
        message: 'Each passenger type can only be entered once',
      })
    }

    if (entry.fares.reduce((total, fare) => total + fare.quantity, 0) > 99) {
      context.addIssue({
        code: 'custom',
        path: ['fares'],
        message: 'A quick entry can contain at most 99 passengers',
      })
    }

    if (new Set(entry.assistantEmployeeIds).size !== entry.assistantEmployeeIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['assistantEmployeeIds'],
        message: 'Each assisting employee can only be selected once',
      })
    }

    if (
      entry.responsibleEmployeeId &&
      entry.assistantEmployeeIds.includes(entry.responsibleEmployeeId)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['assistantEmployeeIds'],
        message: 'The responsible employee cannot also be an assistant',
      })
    }
  })

export type TicketingQuickTkInput = z.output<typeof ticketingQuickTkSchema>

export type TicketingAirlineOption = {
  id: string
  iataCode: string
  name: string
}

export type TicketingSupplierCode = (typeof TICKET_SUPPLIER_CODES)[number]

export type TicketingSupplier = {
  code: TicketingSupplierCode | 'unknown'
  name: string
}

export type TicketingLedgerFare = {
  passengerType: (typeof TICKET_PASSENGER_TYPES)[number]
  quantity: number
  unitSupplierCost: number | null
  unitSalePrice: number | null
  unitGrossSalePrice: number | null
  unitDiscount: number | null
}

export type TicketingLedgerItem = {
  bookingId: string
  transactionId: string
  bookingVersion: number
  transactionVersion: number
  pnr: string
  customerName: string
  airline: TicketingAirlineOption
  supplier: TicketingSupplier
  serviceType: 'TK' | 'DC' | 'R-ER'
  operationalStatus: string
  paymentStatus: string
  bookingDate: string
  timeLimitAt: string | null
  issuedAt: string | null
  passengerCount: number
  packageMatchStatus: string
  commissionScope: string
  detailsStatus: (typeof TICKET_DETAILS_STATUSES)[number]
  fares: TicketingLedgerFare[]
  createdAt: string
  responsibleEmployee: TicketingAttributionEmployee
  assistantEmployees: TicketingAttributionEmployee[]
  attributionVersion: number
}

export type TicketingLedgerResponse = {
  items: TicketingLedgerItem[]
  airlines: TicketingAirlineOption[]
  context: {
    employeeId: string
    employeeName: string
    locationName: string | null
    timezone: string
    canManageAttribution: boolean
    canManageRecords: boolean
    attributionEmployees: TicketingAttributionEmployee[]
  }
}

export type TicketingQuickTkResult = {
  bookingId: string
  transactionId: string
  serviceType: 'TK'
  operationalStatus: 'held' | 'issued'
  paymentStatus: 'unpaid'
  passengerCount: number
  packageMatchStatus: 'unmatched' | 'matched' | 'ambiguous'
  idempotentReplay: boolean
}
