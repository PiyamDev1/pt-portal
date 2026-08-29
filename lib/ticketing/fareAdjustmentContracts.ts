import { z } from 'zod'

export const TICKET_FARE_ADJUSTMENT_CAPABILITY_VERSION = 2026082904
export const TICKET_FARE_ADJUSTMENT_MAX_FARE_GBP = 99_999_999.99
export const TICKET_FARE_ADJUSTMENT_MAX_NOTES_LENGTH = 1_000

const isIsoCalendarDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number)
  if (![year, month, day].every(Number.isInteger)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const ticketingFareAdjustmentDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine(isIsoCalendarDate, 'Use a valid date')

export const ticketingFareAdjustmentMoneySchema = z
  .number()
  .finite()
  .positive()
  .max(TICKET_FARE_ADJUSTMENT_MAX_FARE_GBP)
  .refine(
    (value) => Math.abs(value - Math.round(value * 100) / 100) <= 0.000_000_1,
    'Use no more than 2 decimal places',
  )

export const ticketingAppendFareAdjustmentSchema = z
  .object({
    bookingId: z.string().uuid(),
    expectedBookingVersion: z.number().int().positive().safe(),
    expectedRootTransactionVersion: z.number().int().positive().safe(),
    expectedPreviousAdjustmentId: z.string().uuid().nullable(),
    newSupplierFareGbp: ticketingFareAdjustmentMoneySchema,
    effectiveDate: ticketingFareAdjustmentDateSchema,
    notes: z.string().trim().min(1).max(TICKET_FARE_ADJUSTMENT_MAX_NOTES_LENGTH).nullable(),
    currency: z.literal('GBP'),
  })
  .strict()

export type TicketingAppendFareAdjustmentInput = z.output<
  typeof ticketingAppendFareAdjustmentSchema
>

export type TicketingFareAdjustmentLatest = {
  adjustmentId: string
  previousAdjustmentId: string | null
  sequenceNumber: number
  originalSupplierFareGbp: number
  newSupplierFareGbp: number
  differenceGbp: number
  effectiveDate: string
  actingEmployeeId: string
  createdAt: string
}

export const ticketingRecordFareCheckSchema = z
  .object({
    bookingId: z.string().uuid(),
    expectedBookingVersion: z.number().int().positive().safe(),
    expectedRootTransactionVersion: z.number().int().positive().safe(),
    expectedPreviousAdjustmentId: z.string().uuid().nullable(),
    effectiveDate: ticketingFareAdjustmentDateSchema,
    notes: z.string().trim().min(1).max(TICKET_FARE_ADJUSTMENT_MAX_NOTES_LENGTH).nullable(),
  })
  .strict()

export type TicketingRecordFareCheckInput = z.output<typeof ticketingRecordFareCheckSchema>

export type TicketingFareCheckLatest = {
  checkId: string
  currentAdjustmentId: string | null
  observedFareGbp: number
  effectiveDate: string
  checkedByEmployeeId: string
  createdAt: string
}

export type TicketingRecordFareCheckResult = {
  checkId: string
  bookingId: string
  bookingVersion: number
  rootTransactionId: string
  rootTransactionVersion: number
  observedFareGbp: number
  effectiveDate: string
  packageMatchStatus: 'unmatched' | 'matched' | 'ambiguous' | 'manually_resolved'
  createdAt: string
  idempotentReplay: boolean
}

export type TicketingFareAdjustmentQueueItem = {
  bookingId: string
  bookingVersion: number
  rootTransactionId: string
  rootTransactionVersion: number
  pnr: string
  airline: {
    id: string
    iataCode: string
    name: string
  }
  departureDate: string | null
  returnDate: string | null
  passengerCount: number
  owner: {
    employeeId: string
    fullName: string
  }
  issuedDate: string
  initialSupplierFareGbp: number
  currentSupplierFareGbp: number
  latestAdjustment: TicketingFareAdjustmentLatest | null
  latestCheck: TicketingFareCheckLatest | null
  packageMatchStatus: 'unmatched' | 'matched' | 'ambiguous' | 'manually_resolved'
  updatedAt: string
}

export type TicketingFareAdjustmentQueueResponse = {
  items: TicketingFareAdjustmentQueueItem[]
  filterOptions: {
    owners: Array<{ employeeId: string; fullName: string }>
  }
  hasMore: boolean
  nextCursor: string | null
}

export type TicketingAppendFareAdjustmentResult = {
  bookingId: string
  bookingVersion: number
  rootTransactionId: string
  rootTransactionVersion: number
  adjustmentId: string
  previousAdjustmentId: string | null
  sequenceNumber: number
  currency: 'GBP'
  originalSupplierFareGbp: number
  newSupplierFareGbp: number
  differenceGbp: number
  passengerCount: number
  effectiveDate: string
  packageMatchStatus: 'unmatched' | 'matched' | 'ambiguous' | 'manually_resolved'
  createdAt: string
  idempotentReplay: boolean
}
