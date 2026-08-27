import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireCronAuthorization } from '@/lib/security/cronAuth.server'
import {
  sendTicketTimeLimitEmail,
  type TicketTimeLimitThreshold,
} from '@/lib/ticketing/timeLimitNotifications'
import { hasTicketingSchemaCapability } from '@/lib/ticketing/schemaCapability'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CAPABILITY_VERSION = 2026082702

type NotificationRow = {
  notification_id: string
  booking_id: string
  threshold_key: TicketTimeLimitThreshold
  scheduled_for: string
  recipient_employee_id: string
  recipient_email: string | null
  recipient_name: string | null
  pnr: string
  customer_name: string
  time_limit_at: string
  time_limit_timezone: string
  claim_token: string
}

function isThreshold(value: string): value is TicketTimeLimitThreshold {
  return value === '24h' || value === '6h' || value === '2h' || value === 'expiry'
}

export async function GET(request: Request) {
  const authorizationError = requireCronAuthorization(request)
  if (authorizationError) return authorizationError

  const supabase = getServiceSupabaseClient()
  const { data: capability, error: capabilityError } = await supabase.rpc('ticketing_schema_status')
  if (capabilityError || !hasTicketingSchemaCapability(capability, CAPABILITY_VERSION)) {
    return apiError('Ticketing time-limit processing is not installed on this database.', 503)
  }

  const { data, error } = await supabase.rpc('ticketing_claim_time_limit_notifications', {
    requested_at: new Date().toISOString(),
    batch_size: 100,
  })
  if (error) return apiError('Unable to claim Ticketing time-limit notifications.', 500)

  const rows = (data || []) as NotificationRow[]
  let sent = 0
  let failed = 0

  for (const row of rows) {
    const threshold = row.threshold_key
    const result =
      isThreshold(threshold) && row.recipient_email
        ? await sendTicketTimeLimitEmail({
            to: row.recipient_email,
            recipientName: row.recipient_name,
            pnr: row.pnr,
            customerName: row.customer_name,
            timeLimitAt: row.time_limit_at,
            timeLimitTimezone: row.time_limit_timezone,
            threshold,
          })
        : { sent: false, reason: 'Recipient email is unavailable' }

    const deliveryStatus = result.sent ? 'sent' : 'failed'
    const { error: finishError } = await supabase.rpc('ticketing_finish_time_limit_notification', {
      notification_id_value: row.notification_id,
      claim_token_value: row.claim_token,
      delivery_status_value: deliveryStatus,
      error_message_value: result.reason || null,
    })

    if (finishError || !result.sent) failed += 1
    else sent += 1
  }

  return apiOk({ ok: true, claimed: rows.length, sent, failed })
}
