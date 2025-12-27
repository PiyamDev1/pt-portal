import { z } from 'zod'

// Form Schema for Validation
export const VisaApplicationSchema = z.object({
  applicantName: z.string().min(1, 'Name is required'),
  applicantPassport: z.string().min(1, 'Passport Number is required'),
  countryId: z.string().uuid('Select a country'),
  visaTypeId: z.string().uuid('Select a visa type'),
  customerPrice: z.number().min(0).optional(),
  basePrice: z.number().min(0).optional(),
  costCurrency: z.string().default('GBP'),
  notes: z.string().optional(),
  internalTrackingNo: z.string().min(1, 'Tracking Number is required'),
})

export type VisaApplicationFormData = z.infer<typeof VisaApplicationSchema>

// Status Enum (Adjust these to match your DB 'application_status' enum values)
export const VISA_STATUSES = {
  PENDING: 'Pending',
  SUBMITTED: 'Submitted',
  RECEIVED: 'Received',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected'
}
