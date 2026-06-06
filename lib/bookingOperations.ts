import { BookingStatus } from '@/app/types/bookings'

export type BookingEmailKind = 'confirmation' | 'modification' | 'cancellation' | 'reminder'
export type DirectBookingEmailKind = Exclude<BookingEmailKind, 'reminder'>

export type BookingNotificationStatus = 'sent' | 'failed' | 'skipped'

export function normalizeBookingEmail(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase()
}

export function sanitizeBookingTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of input) {
    if (typeof value !== 'string') continue
    const normalized = value.trim().toLowerCase().replace(/\s+/g, '-')
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export function areBookingTagsEqual(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const left = sanitizeBookingTags(a ?? [])
  const right = sanitizeBookingTags(b ?? [])
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

export function getAllowedBookingTransitions(status: BookingStatus): BookingStatus[] {
  switch (status) {
    case BookingStatus.PENDING:
      return [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.CANCELLED]
    case BookingStatus.CONFIRMED:
      return [BookingStatus.CONFIRMED, BookingStatus.PENDING, BookingStatus.COMPLETED, BookingStatus.CANCELLED]
    case BookingStatus.CANCELLED:
      return [BookingStatus.CANCELLED, BookingStatus.PENDING, BookingStatus.CONFIRMED]
    case BookingStatus.COMPLETED:
      return [BookingStatus.COMPLETED, BookingStatus.CONFIRMED]
    default:
      return [status]
  }
}

export function isAllowedBookingTransition(currentStatus: BookingStatus, nextStatus: BookingStatus): boolean {
  return getAllowedBookingTransitions(currentStatus).includes(nextStatus)
}

export function deriveBookingEmailKind(params: {
  previousStatus: BookingStatus
  nextStatus: BookingStatus
  customerVisibleChange: boolean
  emailChanged: boolean
}): DirectBookingEmailKind | null {
  if (params.nextStatus === BookingStatus.CANCELLED) {
    return 'cancellation'
  }

  if (params.previousStatus === BookingStatus.PENDING && params.nextStatus === BookingStatus.CONFIRMED) {
    return 'confirmation'
  }

  if (params.emailChanged || params.customerVisibleChange) {
    return 'modification'
  }

  return null
}

export function deriveBookingEmailSubject(params: {
  kind: BookingEmailKind
  emailChanged?: boolean
  manualResend?: boolean
}): string {
  if (params.kind === 'cancellation') return 'Your appointment was cancelled'
  if (params.kind === 'reminder') return 'Appointment reminder'
  if (params.kind === 'confirmation') {
    return params.manualResend ? 'Your appointment confirmation was re-sent' : 'Your appointment is booked'
  }
  if (params.emailChanged || params.manualResend) return 'Your appointment details were re-sent'
  return 'Your appointment was updated'
}

export function getIdempotencyKey(request: Request, body: unknown): string | null {
  const headerKey = request.headers.get('idempotency-key')?.trim()
  if (headerKey) return headerKey

  const payloadKey = (body as { idempotency_key?: unknown } | null)?.idempotency_key
  if (typeof payloadKey !== 'string') return null
  const trimmed = payloadKey.trim()
  return trimmed || null
}
