/**
 * POST /api/receipts/verify
 * Verifies receipt authenticity via tracking number and receipt PIN.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { verifyPersistedReceiptByPin } from '@/lib/services/receiptStore'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

type RequestBody = {
  trackingNumber?: string
  receiptPin?: string
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RequestBody
  const trackingNumber = String(body.trackingNumber || '').trim()
  const receiptPin = String(body.receiptPin || '').trim()

  if (!trackingNumber || !receiptPin) {
    return apiError('Missing trackingNumber or receiptPin', 400)
  }

  const limit = await enforceRateLimit(request, {
    scope: 'public.receipt-verify',
    limit: 10,
    windowSeconds: 15 * 60,
    identities: [`ip:${getClientIp(request)}`, `tracking:${trackingNumber.toUpperCase()}`],
  })
  if (!limit.allowed) return limit.response

  const result = await verifyPersistedReceiptByPin(trackingNumber, receiptPin)

  if (!result.supported) {
    return apiOk({
      valid: false,
      supported: false,
      message: result.reason || 'Receipt verification is not available yet',
    })
  }

  if (!result.valid) {
    return apiOk({ valid: false, supported: true, message: 'Invalid receipt credentials' })
  }

  return apiOk({
    valid: true,
    supported: true,
    message: 'Receipt verified',
    receipt: result.receipt,
  })
}
