import { z } from 'zod'

export const TICKET_PASSENGER_TYPES = ['ADT', 'CHD', 'INF'] as const
export const TICKET_QUICK_ENTRY_STATUSES = ['held', 'issued'] as const
export const TICKET_DETAILS_STATUSES = ['needs_details', 'complete'] as const

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

export const ticketingQuickFareSchema = z
  .object({
    passengerType: z.enum(TICKET_PASSENGER_TYPES),
    quantity: z.number().int().min(1).max(99),
    unitSupplierCost: z.number().finite().min(0).max(99_999_999.99),
  })
  .strict()

export const ticketingQuickTkSchema = z
  .object({
    customerName: z.string().trim().min(1).max(200),
    pnr: z.string().trim().min(1).max(20),
    airlineId: z.string().uuid(),
    serviceType: z.literal('TK'),
    operationalStatus: z.enum(TICKET_QUICK_ENTRY_STATUSES),
    bookingDate: isoDateSchema,
    timeLimitAt: localDateTimeSchema.nullable(),
    issuedAt: isoDateSchema.nullable(),
    currency: z.literal('GBP'),
    fares: z.array(ticketingQuickFareSchema).min(1).max(3),
    confirmDuplicate: z.boolean().optional().default(false),
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
  })

export type TicketingQuickTkInput = z.output<typeof ticketingQuickTkSchema>

export type TicketingAirlineOption = {
  id: string
  iataCode: string
  name: string
}

export type TicketingLedgerFare = {
  passengerType: (typeof TICKET_PASSENGER_TYPES)[number]
  quantity: number
  unitSupplierCost: number | null
  unitSalePrice: number | null
}

export type TicketingLedgerItem = {
  bookingId: string
  transactionId: string
  bookingVersion: number
  transactionVersion: number
  pnr: string
  customerName: string
  airline: TicketingAirlineOption
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
}

export type TicketingLedgerResponse = {
  items: TicketingLedgerItem[]
  airlines: TicketingAirlineOption[]
  context: {
    employeeName: string
    locationName: string | null
    timezone: string
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
