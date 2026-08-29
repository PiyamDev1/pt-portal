import { z } from 'zod'
import { TICKET_PASSENGER_TYPES } from '@/lib/ticketing/contracts'

export const TICKET_REFUND_CAPABILITY_VERSION = 2026082903
export const TICKET_REFUND_FORMULA_VERSION = 'ticket-cancellation-v1'
export const TICKET_REFUND_STATUSES = [
  'recorded',
  'part_settled',
  'recovery_pending',
  'settled',
  'closed',
  'voided',
] as const
export const TICKET_REFUND_EVENT_TYPES = [
  'customer_settlement',
  'airline_recovery',
  'other_cost',
  'recovery_finalised',
  'closed',
  'voided',
] as const

const moneySchema = z.number().finite().min(0).max(99_999_999.99)
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .nullable()
    .optional()
    .transform((value) => value || null)
const passengerSchema = z.object({
  passengerType: z.enum(TICKET_PASSENGER_TYPES),
  passengerPosition: z.number().int().min(1).max(99),
})

const manualReplacementSchema = z
  .object({
    source: z.literal('manual'),
    supplierCostGbp: moneySchema,
    salePriceGbp: moneySchema,
    agentCommissionGbp: moneySchema,
    desiredMarkupGbp: moneySchema,
  })
  .strict()

const ledgerReplacementSchema = passengerSchema
  .extend({
    source: z.literal('ledger'),
    bookingId: z.string().uuid(),
    agentCommissionGbp: moneySchema,
    desiredMarkupGbp: moneySchema,
  })
  .strict()

export const ticketingRecordRefundSchema = passengerSchema
  .extend({
    bookingId: z.string().uuid(),
    settlementMode: z.enum(['refund', 'replacement']),
    replacement: z
      .discriminatedUnion('source', [manualReplacementSchema, ledgerReplacementSchema])
      .nullable(),
    airlineCancellationFeeGbp: moneySchema,
    supplierCancellationChargeGbp: moneySchema,
    retainedAgentCommissionGbp: moneySchema,
    desiredCompanyMarkupGbp: moneySchema,
    notes: optionalText(2000),
    overrideReason: optionalText(500),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.settlementMode === 'refund' && value.replacement !== null) {
      context.addIssue({
        code: 'custom',
        path: ['replacement'],
        message: 'A customer refund cannot include a replacement ticket.',
      })
    }
    if (value.settlementMode === 'replacement' && value.replacement === null) {
      context.addIssue({
        code: 'custom',
        path: ['replacement'],
        message: 'Replacement details are required.',
      })
    }
  })

export const ticketingAppendRefundEventSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    eventType: z.enum(TICKET_REFUND_EVENT_TYPES),
    amountGbp: moneySchema.positive().nullable(),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reference: optionalText(200),
    notes: optionalText(2000),
    overrideReason: optionalText(500),
  })
  .strict()
  .superRefine((value, context) => {
    const acceptsAmount = ['customer_settlement', 'airline_recovery', 'other_cost'].includes(
      value.eventType,
    )
    if (acceptsAmount !== (value.amountGbp !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['amountGbp'],
        message: acceptsAmount ? 'A positive amount is required.' : 'This event has no amount.',
      })
    }
    if (['closed', 'voided'].includes(value.eventType) && !value.overrideReason) {
      context.addIssue({
        code: 'custom',
        path: ['overrideReason'],
        message: 'A reason is required.',
      })
    }
  })

export type TicketingRecordRefundInput = z.output<typeof ticketingRecordRefundSchema>
export type TicketingAppendRefundEventInput = z.output<typeof ticketingAppendRefundEventSchema>
export type TicketingRefundStatus = (typeof TICKET_REFUND_STATUSES)[number]
export type TicketingRefundEventType = (typeof TICKET_REFUND_EVENT_TYPES)[number]

export type TicketingRefundItem = {
  id: string
  bookingId: string
  pnr: string
  ticketNumber: string
  passengerName: string | null
  passengerType: (typeof TICKET_PASSENGER_TYPES)[number]
  airline: { id: string; iataCode: string; name: string }
  owner: { id: string; fullName: string }
  settlementMode: 'refund' | 'replacement'
  packageMatchStatus: 'unmatched' | 'matched' | 'ambiguous' | 'manually_resolved'
  commissionScope: 'ticket' | 'package' | 'unresolved'
  originalSalePriceGbp: string | number
  proposedCancellationChargeGbp: string | number
  proposedCustomerRefundGbp: string | number
  expectedAirlineRecoveryGbp: string | number
  expectedCompanyResultGbp: string | number
  customerSettledGbp: string | number
  airlineRecoveredGbp: string | number
  otherActualCostsGbp: string | number
  airlineRecoveryFinal: boolean
  actualCompanyResultGbp: string | number | null
  status: TicketingRefundStatus
  version: number
  notes: string | null
  createdAt: string
}

export type TicketingRefundPage = {
  items: TicketingRefundItem[]
  nextCursor: string | null
  context: { canManage: boolean }
}

export type TicketingRecordRefundResult = {
  refundId: string
  bookingId: string
  status: TicketingRefundStatus
  version: number
  packageMatchStatus: string
  commissionScope: string
  idempotentReplay: boolean
}

export type TicketingRefundEventResult = {
  refundId: string
  eventId: string
  status: TicketingRefundStatus
  version: number
  actualCompanyResultGbp: string | number | null
  idempotentReplay: boolean
}
