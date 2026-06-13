import { getSupabaseClient } from '@/lib/supabaseClient'

export type AuthSecurityEventType =
  | 'password_login'
  | 'passkey_login'
  | 'two_factor'
  | 'backup_code'
  | 'password_update'
  | 'session_revoke'
  | 'frappe_handoff'

export type AuthSecurityEventStatus = 'started' | 'success' | 'failed' | 'blocked' | 'revoked'

type RecordSecurityEventInput = {
  request?: Request
  userId?: string | null
  email?: string | null
  eventType: AuthSecurityEventType
  status: AuthSecurityEventStatus
  metadata?: Record<string, unknown>
}

export const LOGIN_FAILURE_WINDOW_MINUTES = 15
export const LOGIN_FAILURE_LIMIT = 5
export const LOGIN_LOCKOUT_MINUTES = 15

export function getRequestIp(request?: Request) {
  if (!request) return null
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    forwardedFor ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    null
  )
}

export function normalizeSecurityEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null
}

export async function recordAuthSecurityEvent({
  request,
  userId,
  email,
  eventType,
  status,
  metadata = {},
}: RecordSecurityEventInput) {
  try {
    const admin = getSupabaseClient()
    await admin.from('auth_security_events').insert({
      user_id: userId || null,
      email: normalizeSecurityEmail(email),
      event_type: eventType,
      status,
      ip_address: getRequestIp(request),
      user_agent: request?.headers.get('user-agent') || null,
      metadata,
    })
  } catch {
    // Security telemetry must never break the primary auth flow.
  }
}

export async function getLoginGuard(email: string) {
  const normalizedEmail = normalizeSecurityEmail(email)
  if (!normalizedEmail) {
    return { locked: false, failedAttempts: 0, remainingSeconds: 0 }
  }

  const admin = getSupabaseClient()
  const since = new Date(Date.now() - LOGIN_FAILURE_WINDOW_MINUTES * 60_000).toISOString()

  const { data, error } = await admin
    .from('auth_security_events')
    .select('status, created_at')
    .eq('event_type', 'password_login')
    .eq('email', normalizedEmail)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error

  const events = data || []
  const latestSuccess = events.find((event) => event.status === 'success')
  const eventsAfterLatestSuccess = latestSuccess
    ? events.filter((event) => new Date(event.created_at) > new Date(latestSuccess.created_at))
    : events
  const failures = eventsAfterLatestSuccess.filter((event) => event.status === 'failed')

  if (failures.length < LOGIN_FAILURE_LIMIT) {
    return { locked: false, failedAttempts: failures.length, remainingSeconds: 0 }
  }

  const latestFailureAt = new Date(failures[0].created_at).getTime()
  const lockoutEndsAt = latestFailureAt + LOGIN_LOCKOUT_MINUTES * 60_000
  const remainingSeconds = Math.max(Math.ceil((lockoutEndsAt - Date.now()) / 1000), 0)

  return {
    locked: remainingSeconds > 0,
    failedAttempts: failures.length,
    remainingSeconds,
  }
}
