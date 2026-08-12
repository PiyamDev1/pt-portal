import { apiError, apiOk } from '@/lib/api/http'
import {
  type AuthSecurityEventStatus,
  type AuthSecurityEventType,
  recordAuthSecurityEvent,
} from '@/lib/auth/securityEvents'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { z } from 'zod'
import { parseBodyWithSchema } from '@/lib/api/request'

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

const securityEventSchema = z.object({
  eventType: z.enum([
    'password_login',
    'passkey_login',
    'two_factor',
    'backup_code',
    'password_update',
    'session_revoke',
    'frappe_handoff',
  ]),
  status: z.enum(['started', 'success', 'failed', 'blocked', 'revoked']),
  email: z.string().trim().email().max(320).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: Request) {
  const limit = await enforceRateLimit(request, {
    scope: 'auth.security-events',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`ip:${getClientIp(request)}`],
  })
  if (!limit.allowed) return limit.response

  const { data: body, error: bodyError } = await parseBodyWithSchema(request, securityEventSchema, {
    maxBytes: 16 * 1024,
  })
  if (bodyError || !body) return apiError(bodyError || 'Invalid security event', 400)

  if (!body.eventType || !EVENT_TYPES.has(body.eventType)) {
    return apiError('Invalid security event type', 400)
  }

  if (!body.status || !EVENT_STATUSES.has(body.status)) {
    return apiError('Invalid security event status', 400)
  }

  // Password outcomes are recorded only by /api/auth/password-login after
  // Supabase has accepted or rejected the submitted credentials. Never trust
  // a browser-authored failure or success to mutate another user's lockout.
  if (body.eventType === 'password_login') {
    return apiError('Password login security events are server managed', 403)
  }

  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Client-reported success/revocation must be bound to a server-verified user.
  // Otherwise an anonymous caller could inject a fake login success and clear
  // another account's failure window.
  if ((body.status === 'success' || body.status === 'revoked') && !user) {
    return apiError('Authenticated session required for this security event', 401)
  }

  await recordAuthSecurityEvent({
    request,
    userId: user?.id,
    email: user?.email || body.email,
    eventType: body.eventType,
    status: body.status,
    metadata: body.metadata,
  })

  return apiOk({ ok: true })
}
