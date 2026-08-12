import { randomBytes } from 'crypto'

export const PAK_PASSPORT_DRAFT_ID_PREFIX = 'PKD-'
export const PAK_PASSPORT_DRAFT_ID_LENGTH = 10

export const PAK_PASSPORT_DRAFT_STATUSES = [
  'Draft',
  'Documents Pending',
  'Ready to Process',
  'With External Staff',
  'Tracking Received',
  'Converted',
  'Cancelled',
] as const

export const PAK_PASSPORT_DRAFT_PAYMENT_STATUSES = [
  'unknown',
  'not_taken',
  'taken',
  'refunded',
] as const

export type PakPassportDraftStatus = (typeof PAK_PASSPORT_DRAFT_STATUSES)[number]
export type PakPassportDraftPaymentStatus = (typeof PAK_PASSPORT_DRAFT_PAYMENT_STATUSES)[number]

const DRAFT_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function generatePakPassportDraftId() {
  const bytes = randomBytes(PAK_PASSPORT_DRAFT_ID_LENGTH)
  const suffix = Array.from(bytes)
    .map((byte) => DRAFT_ID_ALPHABET[byte % DRAFT_ID_ALPHABET.length])
    .join('')
  return `${PAK_PASSPORT_DRAFT_ID_PREFIX}${suffix}`
}

export function normalizeOfficialTrackingNumber(value: unknown) {
  return String(value || '')
    .trim()
    .toUpperCase()
}

export function splitApplicantName(fullName: string) {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  return {
    firstName: parts[0] || 'N/A',
    lastName: parts.slice(1).join(' ') || 'N/A',
  }
}

export function isPakPassportDraftStatus(value: unknown): value is PakPassportDraftStatus {
  return PAK_PASSPORT_DRAFT_STATUSES.includes(value as PakPassportDraftStatus)
}

export function isPakPassportDraftPaymentStatus(
  value: unknown,
): value is PakPassportDraftPaymentStatus {
  return PAK_PASSPORT_DRAFT_PAYMENT_STATUSES.includes(value as PakPassportDraftPaymentStatus)
}

export function isDuplicateTrackingError(error: unknown) {
  const err = error as { code?: string; message?: string; details?: string; hint?: string } | null
  const combined = `${err?.message || ''} ${err?.details || ''} ${err?.hint || ''}`.toLowerCase()
  return (
    err?.code === '23505' &&
    (combined.includes('applications_tracking_number_key') || combined.includes('tracking_number'))
  )
}
