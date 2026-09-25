import { z } from 'zod'

function isIsoCalendarDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine(isIsoCalendarDate, 'Use a valid date')

export const ticketingRootPaymentStatusSchema = z
  .object({
    expectedBookingVersion: z.number().int().positive().safe(),
    expectedTransactionVersion: z.number().int().positive().safe(),
    paymentStatus: z.enum(['unpaid', 'part_paid', 'paid']),
    paidAt: isoDateSchema.nullable(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.paymentStatus === 'paid' && !entry.paidAt) {
      context.addIssue({
        code: 'custom',
        path: ['paidAt'],
        message: 'A paid ticket requires a paid date.',
      })
    }
    if (entry.paymentStatus !== 'paid' && entry.paidAt) {
      context.addIssue({
        code: 'custom',
        path: ['paidAt'],
        message: 'Only a fully paid ticket can have a paid date.',
      })
    }
  })

export type TicketingRootPaymentStatusInput = z.output<typeof ticketingRootPaymentStatusSchema>
