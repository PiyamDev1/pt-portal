/**
 * POST /api/integrations/frappe/webhook
 *
 * Receives inbound Frappe events and stores them in integration_inbox.
 */

import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { ingestInboundEvent } from '@/lib/integrations/frappe/syncEngine'
import { verifyFrappeWebhookSignature } from '@/lib/integrations/frappe/webhookAuth'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-frappe-signature')

    if (!verifyFrappeWebhookSignature(rawBody, signature)) {
      return apiError('Invalid signature', 401)
    }

    const parsed = rawBody ? JSON.parse(rawBody) : {}
    const eventType = String(parsed.event_type || parsed.eventType || 'unknown')
    const sourceEventId = String(
      parsed.event_id || parsed.eventId || parsed.name || crypto.randomUUID(),
    )

    const result = await ingestInboundEvent({
      source: 'frappe',
      sourceEventId,
      eventType,
      payload: parsed,
    })

    if (!result.accepted) {
      return apiOk({ accepted: false, duplicate: true })
    }

    return apiOk({ accepted: true })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Webhook ingestion failed'), 500)
  }
}
