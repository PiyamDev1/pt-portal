import { z } from 'zod'
import { TICKET_PASSENGER_TYPES } from '@/lib/ticketing/contracts'

export const TICKET_VOUCHER_CAPABILITY_VERSION = 2026082903
export const TICKET_VOUCHER_STATUSES = [
  'unclaimed',
  'claim_submitted',
  'airline_credit_confirmed',
  'part_used',
  'used_on_new_ticket',
  'refund_received',
  'expired',
  'closed',
] as const
export const TICKET_VOUCHER_EVENT_TYPES = [
  'claim_submitted',
  'value_confirmed',
  'part_used',
  'used_on_new_ticket',
  'refund_received',
  'expired',
  'closed',
  'deadline_corrected',
] as const

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .nullable()
    .optional()
    .transform((value) => value || null)

export const ticketingCreateVoucherSchema = z
  .object({
    bookingId: z.string().uuid(),
    passengerType: z.enum(TICKET_PASSENGER_TYPES),
    passengerPosition: z.number().int().min(1).max(99),
    followUpEmployeeId: z.string().uuid().nullable().optional(),
    cancellationDate: dateSchema,
    claimByDate: dateSchema.nullable().optional(),
    airlineReference: optionalText(120),
    notes: optionalText(2000),
  })
  .strict()

export const ticketingAppendVoucherEventSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    eventType: z.enum(TICKET_VOUCHER_EVENT_TYPES),
    amountGbp: z.number().finite().positive().max(99_999_999.99).nullable(),
    eventDate: dateSchema,
    linkedBookingId: z.string().uuid().nullable(),
    linkedPassengerType: z.enum(TICKET_PASSENGER_TYPES).nullable(),
    linkedPassengerPosition: z.number().int().min(1).max(99).nullable(),
    refundId: z.string().uuid().nullable(),
    airlineReference: optionalText(120),
    notes: optionalText(2000),
    reason: optionalText(500),
  })
  .strict()
  .superRefine((value, context) => {
    const amountEvents = ['value_confirmed', 'part_used', 'used_on_new_ticket', 'refund_received']
    if (amountEvents.includes(value.eventType) !== (value.amountGbp !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['amountGbp'],
        message: amountEvents.includes(value.eventType)
          ? 'A positive amount is required.'
          : 'This event has no amount.',
      })
    }
    const allocationEvent = ['part_used', 'used_on_new_ticket'].includes(value.eventType)
    const hasAnyAllocation =
      value.linkedBookingId !== null ||
      value.linkedPassengerType !== null ||
      value.linkedPassengerPosition !== null
    const hasAllocation =
      value.linkedBookingId !== null &&
      value.linkedPassengerType !== null &&
      value.linkedPassengerPosition !== null
    if ((allocationEvent && !hasAllocation) || (!allocationEvent && hasAnyAllocation)) {
      context.addIssue({
        code: 'custom',
        path: ['linkedBookingId'],
        message: allocationEvent
          ? 'Select the exact replacement passenger ticket.'
          : 'This event cannot allocate a passenger ticket.',
      })
    }
    if (['closed', 'deadline_corrected'].includes(value.eventType) && !value.reason) {
      context.addIssue({ code: 'custom', path: ['reason'], message: 'A reason is required.' })
    }
  })

export type TicketingCreateVoucherInput = z.output<typeof ticketingCreateVoucherSchema>
export type TicketingAppendVoucherEventInput = z.output<typeof ticketingAppendVoucherEventSchema>
export type TicketingVoucherStatus = (typeof TICKET_VOUCHER_STATUSES)[number]
export type TicketingVoucherEventType = (typeof TICKET_VOUCHER_EVENT_TYPES)[number]

export type TicketingVoucherItem = {
  id: string
  bookingId: string
  pnr: string
  ticketNumber: string
  passengerName: string | null
  passengerType: 'ADT' | 'YTH' | 'CHD' | 'INF'
  airline: { id: string; iataCode: string; name: string }
  owner: { id: string; fullName: string }
  followUpOwner: { id: string; fullName: string }
  issueDate: string
  cancellationDate: string
  claimByDate: string
  status: TicketingVoucherStatus
  confirmedValueGbp: string | number | null
  remainingValueGbp: string | number | null
  airlineReference: string | null
  notes: string | null
  version: number
  createdAt: string
}

export type TicketingVoucherPage = {
  items: TicketingVoucherItem[]
  nextCursor: string | null
  context: { canManage: boolean }
}

export type TicketingCreateVoucherResult = {
  voucherId: string
  bookingId: string
  status: 'unclaimed'
  claimByDate: string
  idempotentReplay: boolean
}

export type TicketingVoucherEventItem = {
  id: string
  eventType: 'created' | TicketingVoucherEventType
  actor: { id: string; fullName: string }
  linkedBookingId: string | null
  linkedTransactionPassengerId: string | null
  refundId: string | null
  amountGbp: string | number | null
  eventDate: string
  notes: string | null
  eventData: Record<string, unknown>
  createdAt: string
}

export type TicketingVoucherEventResult = {
  voucherId: string
  eventId: string
  status: TicketingVoucherStatus
  confirmedValueGbp: string | number | null
  remainingValueGbp: string | number | null
  claimByDate: string
  version: number
  idempotentReplay: boolean
}
