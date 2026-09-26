import { z } from 'zod'

export const TICKET_REPLACEMENT_CASE_CAPABILITY_VERSION = 2026092601

export const TICKET_REPLACEMENT_REASONS = [
  'fare_expired_staff_error',
  'supplier_failure',
  'schedule_disruption',
  'customer_requested_change',
  'other',
] as const

export const TICKET_REPLACEMENT_RECOVERY_POLICIES = [
  'above_customer_sale',
  'full_cost_increase',
  'business_absorbs',
] as const

const linkedTicketSchema = z
  .object({
    bookingId: z.string().uuid(),
    transactionId: z.string().uuid(),
  })
  .strict()

export const ticketingCreateReplacementCaseSchema = z
  .object({
    original: linkedTicketSchema.extend({
      expectedBookingVersion: z.number().int().positive().safe(),
    }),
    responsibleEmployeeId: z.string().uuid(),
    reason: z.enum(TICKET_REPLACEMENT_REASONS),
    recoveryPolicy: z.enum(TICKET_REPLACEMENT_RECOVERY_POLICIES),
    replacements: z.array(linkedTicketSchema).min(1).max(8),
    notes: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const bookingIds = value.replacements.map((ticket) => ticket.bookingId)
    if (new Set(bookingIds).size !== bookingIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['replacements'],
        message: 'Each replacement PNR can only be linked once.',
      })
    }
    if (bookingIds.includes(value.original.bookingId)) {
      context.addIssue({
        code: 'custom',
        path: ['replacements'],
        message: 'The original ticket cannot also be a replacement.',
      })
    }
  })

const moneySchema = z
  .number()
  .finite()
  .min(0)
  .max(99_999_999.99)
  .refine(
    (value) => Math.abs(value - Math.round(value * 100) / 100) <= 0.000_000_1,
    'Use no more than two decimal places.',
  )

export const ticketingAppendReplacementChangeSchema = z
  .object({
    expectedVersion: z.number().int().positive().safe(),
    replacedItemId: z.string().uuid(),
    replacement: linkedTicketSchema,
    supplierRefundGbp: moneySchema,
    supplierAdminFeeGbp: moneySchema,
    customerChargeGbp: moneySchema,
    notes: z.string().trim().min(1).max(2_000).nullable(),
  })
  .strict()

export type TicketingCreateReplacementCaseInput = z.output<
  typeof ticketingCreateReplacementCaseSchema
>
export type TicketingAppendReplacementChangeInput = z.output<
  typeof ticketingAppendReplacementChangeSchema
>

export type TicketingReplacementLookupItem = {
  bookingId: string
  transactionId: string
  bookingVersion: number
  pnr: string
  customerName: string
  passengerCount: number
  supplierCostGbp: number
  salePriceGbp: number
  owner: { id: string; fullName: string }
  airline: { id: string; iataCode: string; name: string }
  issuedAt: string
}

export type TicketingReplacementCaseItem = {
  id: string
  bookingId: string
  transactionId: string
  pnr: string
  supplierCostGbp: number
  salePriceGbp: number
  owner: { id: string; fullName: string }
  position: number
}

export type TicketingReplacementChange = {
  id: string
  replacedItemId: string
  newBookingId: string
  newTransactionId: string
  newPnr: string
  supplierRefundGbp: number
  supplierAdminFeeGbp: number
  newSupplierCostGbp: number
  customerChargeGbp: number
  incrementalResultGbp: number
  servicingEmployee: { id: string; fullName: string }
  notes: string | null
  createdAt: string
}

export type TicketingReplacementCase = {
  id: string
  version: number
  status: 'recorded' | 'closed' | 'voided'
  reason: (typeof TICKET_REPLACEMENT_REASONS)[number]
  recoveryPolicy: (typeof TICKET_REPLACEMENT_RECOVERY_POLICIES)[number]
  original: {
    bookingId: string
    transactionId: string
    pnr: string
    salePriceGbp: number
    supplierCostGbp: number
  }
  responsibleEmployee: { id: string; fullName: string }
  createdBy: { id: string; fullName: string }
  replacementSupplierCostGbp: number
  supplierCostIncreaseGbp: number
  companyMarginAbsorbedGbp: number
  employeeRecoveryGbp: number
  originalCommissionTreatment: 'reverse'
  replacementCommissionTreatment: 'standard'
  notes: string | null
  items: TicketingReplacementCaseItem[]
  changes: TicketingReplacementChange[]
  createdAt: string
}

export type TicketingReplacementCasePage = {
  items: TicketingReplacementCase[]
  context: {
    employeeId: string
    canManageTeam: boolean
    employees: Array<{ id: string; fullName: string }>
  }
}

export function calculateReplacementRecovery(input: {
  originalSaleGbp: number
  originalSupplierCostGbp: number
  replacementSupplierCostGbp: number
  recoveryPolicy: (typeof TICKET_REPLACEMENT_RECOVERY_POLICIES)[number]
}) {
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
  const supplierCostIncreaseGbp = round(
    Math.max(input.replacementSupplierCostGbp - input.originalSupplierCostGbp, 0),
  )
  const originalMarginGbp = round(
    Math.max(input.originalSaleGbp - input.originalSupplierCostGbp, 0),
  )
  const employeeRecoveryGbp = round(
    input.recoveryPolicy === 'above_customer_sale'
      ? Math.max(input.replacementSupplierCostGbp - input.originalSaleGbp, 0)
      : input.recoveryPolicy === 'full_cost_increase'
        ? supplierCostIncreaseGbp
        : 0,
  )
  return {
    supplierCostIncreaseGbp,
    originalMarginGbp,
    employeeRecoveryGbp,
    companyMarginAbsorbedGbp: round(Math.max(supplierCostIncreaseGbp - employeeRecoveryGbp, 0)),
  }
}

export function calculateReplacementChange(input: {
  supplierRefundGbp: number
  newSupplierCostGbp: number
  customerChargeGbp: number
}) {
  return (
    Math.round(
      (input.customerChargeGbp + input.supplierRefundGbp - input.newSupplierCostGbp) * 100,
    ) / 100
  )
}
