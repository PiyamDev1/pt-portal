import { apiError, apiOk } from '@/lib/api/http'
import {
  type AuthSecurityEventStatus,
  type AuthSecurityEventType,
  recordAuthSecurityEvent,
} from '@/lib/auth/securityEvents'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EVENT_TYPES = new Set<AuthSecurityEventType>([
  'password_login',
  'passkey_login',
  'two_factor',
  'backup_code',
  'password_update',
  'session_revoke',
  'frappe_handoff',
])

const EVENT_STATUSES = new Set<AuthSecurityEventStatus>([
  'started',
  'success',
  'failed',
  'blocked',
  'revoked',
])

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    eventType?: AuthSecurityEventType
    status?: AuthSecurityEventStatus
    email?: string
    userId?: string
    metadata?: Record<string, unknown>
  }

  if (!body.eventType || !EVENT_TYPES.has(body.eventType)) {
    return apiError('Invalid security event type', 400)
  }

  if (!body.status || !EVENT_STATUSES.has(body.status)) {
    return apiError('Invalid security event status', 400)
  }

  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await recordAuthSecurityEvent({
    request,
    userId: user?.id,
    email: body.email,
    eventType: body.eventType,
    status: body.status,
    metadata: body.metadata,
  })

  return apiOk({ ok: true })
}
