import { z } from 'zod'
import { TICKET_PASSENGER_TYPES } from './contracts'

export const TICKET_SERVICE_TRANSACTION_TYPES = ['DC', 'R-ER'] as const

function isIsoCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (![year, month, day].every(Number.isInteger)) return false
  const date = new Date(Date.UTC(year, month - 1, day))
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine(isIsoCalendarDate, 'Use a valid date')

const moneySchema = z.number().finite().min(0).max(99_999_999.99)

export const ticketingServiceFareSchema = z
  .object({
    passengerType: z.enum(TICKET_PASSENGER_TYPES),
    quantity: z.number().int().min(1).max(99),
    unitSupplierCost: moneySchema,
    unitSalePrice: moneySchema,
  })
  .strict()

export const ticketingAppendServiceTransactionSchema = z
  .object({
    expectedBookingVersion: z.number().int().positive().safe(),
    expectedRootTransactionVersion: z.number().int().positive().safe(),
    serviceType: z.enum(TICKET_SERVICE_TRANSACTION_TYPES),
    bookingDate: isoDateSchema,
    issuedAt: isoDateSchema,
    paymentStatus: z.enum(['unpaid', 'paid']),
    paidAt: isoDateSchema.nullable(),
    currency: z.literal('GBP'),
    selectedPassengerIds: z.array(z.string().uuid()).min(1).max(99),
    fares: z.array(ticketingServiceFareSchema).min(1).max(3),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.issuedAt < entry.bookingDate) {
      context.addIssue({
        code: 'custom',
        path: ['issuedAt'],
        message: 'Issued date cannot be before the service booking date',
      })
    }

    if (entry.paymentStatus === 'paid' && !entry.paidAt) {
      context.addIssue({
        code: 'custom',
        path: ['paidAt'],
        message: 'A paid service requires a paid date',
      })
    }
    if (entry.paymentStatus === 'unpaid' && entry.paidAt) {
      context.addIssue({
        code: 'custom',
        path: ['paidAt'],
        message: 'An unpaid service cannot have a paid date',
      })
    }

    const passengerTypes = entry.fares.map((fare) => fare.passengerType)
    if (new Set(passengerTypes).size !== passengerTypes.length) {
      context.addIssue({
        code: 'custom',
        path: ['fares'],
        message: 'Each affected passenger type can only be entered once',
      })
    }

    if (entry.fares.reduce((total, fare) => total + fare.quantity, 0) > 99) {
      context.addIssue({
        code: 'custom',
        path: ['fares'],
        message: 'A service transaction can affect at most 99 passengers',
      })
    }

    if (new Set(entry.selectedPassengerIds).size !== entry.selectedPassengerIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['selectedPassengerIds'],
        message: 'Each affected passenger can only be selected once',
      })
    }

    if (entry.selectedPassengerIds.length !== entry.fares.reduce((total, fare) => total + fare.quantity, 0)) {
      context.addIssue({
        code: 'custom',
        path: ['selectedPassengerIds'],
        message: 'Selected passengers must match the affected quantities',
      })
    }
  })

export type TicketingAppendServiceTransactionInput = z.output<
  typeof ticketingAppendServiceTransactionSchema
>

export const ticketingMarkServiceTransactionPaidSchema = z
  .object({
    expectedBookingVersion: z.number().int().positive().safe(),
    expectedTransactionVersion: z.number().int().positive().safe(),
    paidAt: isoDateSchema,
  })
  .strict()

export type TicketingMarkServiceTransactionPaidInput = z.output<
  typeof ticketingMarkServiceTransactionPaidSchema
>

export type TicketingAppendServiceTransactionResult = {
  bookingId: string
  bookingVersion: number
  rootTransactionId: string
  rootTransactionVersion: number
  transactionId: string
  transactionVersion: number
  serviceType: (typeof TICKET_SERVICE_TRANSACTION_TYPES)[number]
  operationalStatus: 'issued'
  paymentStatus: 'unpaid' | 'paid'
  passengerCount: number
  packageMatchStatus: 'unmatched' | 'matched' | 'ambiguous' | 'manually_resolved'
  idempotentReplay: boolean
}
