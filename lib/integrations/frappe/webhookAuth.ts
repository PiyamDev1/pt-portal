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

  // Webhook authentication must fail closed in every environment. Local
  // development can use any explicit shared value, but never an unsigned path.
  if (!secret) {
    return false
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
