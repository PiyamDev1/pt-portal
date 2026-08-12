import { createHash, timingSafeEqual } from 'node:crypto'
import { apiError } from '@/lib/api/http'

function hasMatchingBearerToken(authorization: string | null, secret: string) {
  if (!authorization) return false

  const suppliedDigest = createHash('sha256').update(authorization).digest()
  const expectedDigest = createHash('sha256').update(`Bearer ${secret}`).digest()
  return timingSafeEqual(suppliedDigest, expectedDigest)
}

/**
 * Require Vercel-compatible CRON_SECRET Bearer authentication.
 *
 * Scheduled jobs fail closed when the deployment is not configured. We do not
 * trust `x-vercel-cron` because clients can supply that header themselves.
 */
export function requireCronAuthorization(request: Request): Response | null {
  const cronSecret = process.env.CRON_SECRET?.trim()
  if (!cronSecret) {
    return apiError(
      'Scheduled job authentication is not configured',
      503,
      {},
      {
        headers: { 'Cache-Control': 'private, no-store', 'Retry-After': '60' },
      },
    )
  }

  if (!hasMatchingBearerToken(request.headers.get('authorization'), cronSecret)) {
    return apiError(
      'Unauthorized',
      401,
      {},
      {
        headers: { 'Cache-Control': 'private, no-store' },
      },
    )
  }

  return null
}
