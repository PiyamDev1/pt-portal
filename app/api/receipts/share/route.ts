/**
 * POST /api/receipts/share
 * Marks a generated receipt as shared and tracks channel/timestamp.
 */

import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { markPersistedReceiptShared } from '@/lib/services/receiptStore'
import { requireStaffSession } from '@/lib/auth/staffSession'

const shareReceiptSchema = z
  .object({
    receiptId: z.string().trim().min(1).max(200),
    channel: z.string().trim().max(100).nullable().optional(),
  })
  .strip()

export async function POST(request: Request) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, shareReceiptSchema, {
    maxBytes: 4 * 1024,
  })
  if (bodyError || !body) {
    return apiError(
      bodyError || 'Invalid receipt sharing request',
      bodyError === 'Request body is too large' ? 413 : 400,
    )
  }
  const receiptId = body.receiptId
  const channel = body.channel ? body.channel.toLowerCase() : null

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
