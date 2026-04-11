/**
 * Module: lib/constants/receiptConfig.ts
 * Shared configuration for receipt generation.
 */

export const RECEIPT_PIN_LENGTH = 6

export const RECEIPT_SERVICE_LABELS = {
  nadra: 'NADRA Application',
  pk_passport: 'Pakistani Passport',
  gb_passport: 'British Passport',
} as const

export const RECEIPT_TYPE_LABELS = {
  submission: 'Application Submitted',
  biometrics: 'Application at Biometrics Submitted',
  refund: 'Refund Receipt',
  collection: 'Passport Collected/Returned',
} as const

export const RECEIPT_DEFAULT_CURRENCY = 'GBP'

export const RECEIPT_COMPANY_NAME = process.env.RECEIPT_COMPANY_NAME || 'PT Portal'

export const RECEIPT_VERIFY_BASE_URL =
  process.env.RECEIPT_VERIFY_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || ''
