/**
 * POST /api/receipts/share
 * Marks a generated receipt as shared and tracks channel/timestamp.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { markPersistedReceiptShared } from '@/lib/services/receiptStore'

type RequestBody = {
  receiptId?: string
  channel?: string | null
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody
  const receiptId = String(body.receiptId || '').trim()
  const channel = body.channel ? String(body.channel).trim().toLowerCase() : null

  if (!receiptId) {
    return apiError('Missing receiptId', 400)
  }

  const result = await markPersistedReceiptShared({ receiptId, channel })

  if (!result.supported) {
    return apiOk({
      supported: false,
      updated: false,
      message: result.reason || 'Receipt sharing tracking is not available yet',
    })
  }

  if (!result.updated) {
    return apiError(result.reason || 'Receipt not found', 404)
  }

  return apiOk({
    supported: true,
    updated: true,
    receiptId: result.receiptId,
    shareCount: result.shareCount,
    channel: result.channel,
    sharedAt: result.sharedAt,
  })
}
