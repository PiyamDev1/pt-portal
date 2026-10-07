/**
 * POST /api/receipts/verify
 * Verifies receipt authenticity via tracking number and receipt PIN.
 */

import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { verifyPersistedReceiptByPin } from '@/lib/services/receiptStore'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

const verifyReceiptSchema = z.object({
  trackingNumber: z.string().trim().max(200).optional(),
  receiptPin: z.string().trim().max(128).optional(),
})

export async function POST(request: Request) {
  const { data: body, error: bodyError } = await parseBodyWithSchema(request, verifyReceiptSchema, {
    maxBytes: 16 * 1024,
  })
  if (bodyError || !body) return apiError('Missing trackingNumber or receiptPin', 400)

  const { trackingNumber = '', receiptPin = '' } = body

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
