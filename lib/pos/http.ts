import { apiError } from '@/lib/api/http'
import { PosServerError } from '@/lib/pos/server'

export const POS_PRIVATE_RESPONSE = { headers: { 'Cache-Control': 'private, no-store' } } as const

export function posIdempotencyKey(request: Request) {
  const value = request.headers.get('Idempotency-Key')?.trim() || ''
  return value.length >= 8 && value.length <= 200 ? value : null
}

export function posErrorResponse(error: unknown) {
  if (error instanceof PosServerError) {
    return apiError(
      error.message,
      error.status,
      error.code === 'POS_DUPLICATE_WARNING' ? { duplicateWarning: true } : {},
      POS_PRIVATE_RESPONSE,
    )
  }
  return apiError('The POS action is temporarily unavailable.', 500, {}, POS_PRIVATE_RESPONSE)
}
