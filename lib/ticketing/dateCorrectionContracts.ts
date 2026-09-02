import { z } from 'zod'

export const TICKET_DATE_CORRECTION_CAPABILITY_VERSION = 2026090204
export const TICKET_DATE_CORRECTION_MAX_REASON_LENGTH = 500

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }, 'Use a valid date')

const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use a valid local date and time')
  .refine((value) => {
    const date = new Date(`${value}:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value
  }, 'Use a valid local date and time')

export const ticketingCorrectDatesSchema = z
  .object({
    transactionId: z.string().uuid(),
    expectedBookingVersion: z.number().int().positive().safe(),
    expectedTransactionVersion: z.number().int().positive().safe(),
    operationalStatus: z.enum(['held', 'issued', 'cancelled', 'part_refunded', 'refunded']),
    bookingDate: isoDateSchema,
    timeLimitAt: localDateTimeSchema.nullable(),
    issuedAt: isoDateSchema.nullable(),
    reason: z.string().trim().min(1).max(TICKET_DATE_CORRECTION_MAX_REASON_LENGTH),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.operationalStatus === 'held') {
      if (!entry.timeLimitAt) {
        context.addIssue({
          code: 'custom',
          path: ['timeLimitAt'],
          message: 'A held booking requires an airline time limit',
        })
      } else if (entry.timeLimitAt.slice(0, 10) < entry.bookingDate) {
        context.addIssue({
          code: 'custom',
          path: ['timeLimitAt'],
          message: 'Airline time limit cannot be before the booking date',
        })
      }
      if (entry.issuedAt !== null) {
        context.addIssue({
          code: 'custom',
          path: ['issuedAt'],
          message: 'A held booking cannot have an issued date',
        })
      }
      return
    }

    if (entry.operationalStatus === 'cancelled') {
      if ((entry.timeLimitAt === null) === (entry.issuedAt === null)) {
        context.addIssue({
          code: 'custom',
          path: ['timeLimitAt'],
          message: 'A cancelled ticket requires either its airline deadline or issued date',
        })
        return
      }
      if (entry.timeLimitAt && entry.timeLimitAt.slice(0, 10) < entry.bookingDate) {
        context.addIssue({
          code: 'custom',
          path: ['timeLimitAt'],
          message: 'Airline time limit cannot be before the booking date',
        })
      }
      if (entry.issuedAt && entry.issuedAt < entry.bookingDate) {
        context.addIssue({
          code: 'custom',
          path: ['issuedAt'],
          message: 'Issued date cannot be before the booking date',
        })
      }
      return
    }

    if (!entry.issuedAt) {
      context.addIssue({
        code: 'custom',
        path: ['issuedAt'],
        message: 'An issued ticket requires an issued date',
      })
    } else if (entry.issuedAt < entry.bookingDate) {
      context.addIssue({
        code: 'custom',
        path: ['issuedAt'],
        message: 'Issued date cannot be before the booking date',
      })
    }
    if (entry.timeLimitAt !== null) {
      context.addIssue({
        code: 'custom',
        path: ['timeLimitAt'],
        message: 'An issued ticket cannot retain an airline time limit',
      })
    }
  })

export type TicketingCorrectDatesInput = z.output<typeof ticketingCorrectDatesSchema>

export type TicketingCorrectDatesResult = {
  bookingId: string
  transactionId: string
  bookingVersion: number
  transactionVersion: number
  bookingDate: string
  timeLimitAt: string | null
  issuedAt: string | null
  idempotentReplay: boolean
}
