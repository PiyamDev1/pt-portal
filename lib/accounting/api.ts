import { apiError } from '@/lib/api/http'

export const ACCOUNTING_PRIVATE_RESPONSE = {
  headers: { 'Cache-Control': 'private, no-store, max-age=0' },
} as const

export function accountingError(message: string, status: number) {
  return apiError(message, status, {}, ACCOUNTING_PRIVATE_RESPONSE)
}

export function accountingReviewDatabaseError(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || '')
  const hint = String((error as { hint?: string } | null)?.hint || '')

  if (code === '42501' && hint === 'COMMISSION_REVIEW_SEPARATION_REQUIRED') {
    return {
      message: 'A different Accounting reviewer must give final approval.',
      status: 403,
    }
  }
  if (code === '42501') return { message: 'Forbidden', status: 403 }
  if (code === 'P0002') return { message: 'Commission review batch not found.', status: 404 }
  if (code === '55000' && hint === 'COMMISSION_REVIEW_STALE') {
    return {
      message:
        'Commission results changed after submission. Return this batch and prepare a new revision.',
      status: 409,
    }
  }
  if (code === '40001' || code === '55000' || code === '55P03') {
    return {
      message: 'This Commission review batch changed. Refresh it before trying again.',
      status: 409,
    }
  }
  if (code === '22023' || code === '23514') {
    return { message: 'The Commission review request is invalid.', status: 400 }
  }
  if (code === '42P01' || code === '42883' || code === 'PGRST202') {
    return {
      message: 'Commission Accounting review is not installed on this database.',
      status: 503,
    }
  }

  return { message: 'Commission Accounting review failed.', status: 500 }
}
