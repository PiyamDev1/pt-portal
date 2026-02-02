import { z } from 'zod'
import type { PakApplicationFormData } from './types'

export const cnicPattern = /^[0-9]{5}-[0-9]{7}-[0-9]$/

export const PakApplicationFormSchema = z.object({
  applicantName: z.string().min(1, 'Name is required'),
  applicantCnic: z.string().regex(cnicPattern, 'CNIC must be #####:#######:#'),
  applicantEmail: z.union([z.string().email('Invalid email'), z.literal('')]),
  familyHeadEmail: z.string().email('Valid family head email is required'),
  applicationType: z.string().min(1, 'Application type is required'),
  category: z.string().min(1, 'Category is required'),
  pageCount: z.string().min(1, 'Page count is required'),
  speed: z.string().min(1, 'Speed is required'),
  trackingNumber: z.string().min(1, 'Tracking number is required'),
  oldPassportNumber: z.union([z.string(), z.literal('')]),
  fingerprintsCompleted: z.boolean(),
})

export type PakApplicationFormErrors = Partial<Record<keyof PakApplicationFormData, string>>