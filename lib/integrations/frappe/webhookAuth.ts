/**
 * Frappe webhook signature verification.
 */

import crypto from 'crypto'

function timingSafeEqualHex(a: string, b: string) {
  const left = Buffer.from(a, 'hex')
  const right = Buffer.from(b, 'hex')

  if (left.length !== right.length) {
    return false
  }

  return crypto.timingSafeEqual(left, right)
}

export function verifyFrappeWebhookSignature(rawBody: string, providedSignature: string | null) {
  const secret = process.env.FRAPPE_WEBHOOK_SECRET

  // Development fallback: if no secret is configured, accept payload.
  if (!secret) {
    return true
  }

  if (!providedSignature) {
    return false
  }

  const normalized = providedSignature.trim().replace(/^sha256=/i, '')
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')

  if (normalized.length !== expected.length) {
    return false
  }

  return timingSafeEqualHex(normalized, expected)
}
