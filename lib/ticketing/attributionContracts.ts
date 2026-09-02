import { z } from 'zod'

export const TICKET_ATTRIBUTION_CAPABILITY_VERSION = 2026090201
export const TICKET_ATTRIBUTION_MAX_ASSISTANTS = 10
export const TICKET_ATTRIBUTION_MAX_REASON_LENGTH = 500
export const TICKET_ATTRIBUTION_COMMERCIAL_TREATMENTS = [
  'standard',
  'staff_family',
  'commission_waived',
] as const

const employeeIdSchema = z.string().uuid()

function addAssistantIssues(
  entry: { responsibleEmployeeId: string; assistantEmployeeIds: string[] },
  context: z.RefinementCtx,
) {
  if (new Set(entry.assistantEmployeeIds).size !== entry.assistantEmployeeIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['assistantEmployeeIds'],
      message: 'Each assisting employee can only be selected once',
    })
  }

  if (entry.assistantEmployeeIds.includes(entry.responsibleEmployeeId)) {
    context.addIssue({
      code: 'custom',
      path: ['assistantEmployeeIds'],
      message: 'The responsible employee cannot also be an assistant',
    })
  }
}

export const ticketingCorrectAttributionSchema = z
  .object({
    expectedBookingVersion: z.number().int().positive().safe(),
    responsibleEmployeeId: employeeIdSchema,
    assistantEmployeeIds: z
      .array(employeeIdSchema)
      .max(TICKET_ATTRIBUTION_MAX_ASSISTANTS)
      .default([]),
    commercialTreatment: z.enum(TICKET_ATTRIBUTION_COMMERCIAL_TREATMENTS),
    commissionWaiverReason: z.string().trim().min(3).max(500).nullable(),
    reason: z.string().trim().min(1).max(TICKET_ATTRIBUTION_MAX_REASON_LENGTH),
  })
  .strict()
  .superRefine((entry, context) => {
    addAssistantIssues(entry, context)
    if (entry.commercialTreatment === 'standard' && entry.commissionWaiverReason !== null) {
      context.addIssue({
        code: 'custom',
        path: ['commissionWaiverReason'],
        message: 'Standard commission treatment cannot include a waiver reason',
      })
    }
    if (entry.commercialTreatment !== 'standard' && entry.commissionWaiverReason === null) {
      context.addIssue({
        code: 'custom',
        path: ['commissionWaiverReason'],
        message: 'A commission treatment reason is required',
      })
    }
  })

export type TicketingCorrectAttributionInput = z.output<typeof ticketingCorrectAttributionSchema>

export type TicketingAttributionEmployee = {
  id: string
  fullName: string
}

export type TicketingAttributionSnapshot = {
  responsibleEmployee: TicketingAttributionEmployee
  assistantEmployees: TicketingAttributionEmployee[]
  attributionVersion: number
}

export type TicketingCorrectAttributionResult = TicketingAttributionSnapshot & {
  bookingId: string
  bookingVersion: number
  idempotentReplay: boolean
}
