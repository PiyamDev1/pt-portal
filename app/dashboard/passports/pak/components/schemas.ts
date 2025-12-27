import { z } from 'zod'
import type { PakApplicationFormData } from './types'

export const cnicPattern = /^[0-9]{5}-[0-9]{7}-[0-9]$/

export const PakApplicationFormSchema = z.object({
  applicantName: z.string().min(1, 'Name is required'),
  applicantCnic: z.string().regex(cnicPattern, 'CNIC must be #####:#######:#'),
  applicantEmail: z.union([z.string().email('Invalid email'), z.literal('')]),
  applicationType: z.enum(['First Time', 'Renewal', 'Modification', 'Lost']),
  category: z.enum(['Adult 10 Year', 'Adult 5 Year', 'Child 5 Year']),
  pageCount: z.enum(['34 pages', '54 pages', '72 pages', '100 pages']),
  speed: z.enum(['Normal', 'Executive']),
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  oldPassportNumber: z.union([z.string(), z.literal('')]),
  fingerprintsCompleted: z.boolean(),
})

export type PakApplicationFormErrors = Partial<Record<keyof PakApplicationFormData, string>>