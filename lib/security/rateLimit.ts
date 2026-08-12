import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { logServerEvent, reportOperationalError } from '@/lib/observability/server'

type RateLimitRpcRow = {
  allowed?: boolean
  remaining?: number
  retry_after_seconds?: number
}

export type RateLimitOptions = {
  scope: string
  limit: number
  windowSeconds: number
  identities?: Array<string | null | undefined>
  message?: string
  unavailable?: 'deny' | 'allow'
}

export type RateLimitResult =
  | {
      allowed: true
      remaining: number
      retryAfterSeconds: 0
      response?: never
    }
  | {
      allowed: false
      remaining: 0
      retryAfterSeconds: number
      response: NextResponse
    }

export function getClientIp(request: Request) {
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    'unknown'
  )
}

function hashIdentity(value: string) {
  const pepper = process.env.RATE_LIMIT_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!pepper) throw new Error('Rate-limit hashing secret is not configured')
  return createHash('sha256').update(`${pepper}:${value}`).digest('hex')
}

function rateLimitResponse(message: string, retryAfterSeconds: number) {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(retryAfterSeconds, 1)),
        'Cache-Control': 'private, no-store',
      },
    },
  )
}

function unavailableResponse() {
  return NextResponse.json(
    { error: 'Request protection is temporarily unavailable. Please try again shortly.' },
    { status: 503, headers: { 'Retry-After': '30', 'Cache-Control': 'private, no-store' } },
  )
}

/**
 * Enforce a database-backed fixed-window limit for every supplied identity.
 *
 * Sensitive routes fail closed if the shared limiter is unavailable. Raw IPs,
 * emails, tokens and user IDs are never persisted in the bucket table.
 */
export async function enforceRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const rawIdentities = options.identities?.length
    ? options.identities
    : [`ip:${getClientIp(request)}`]
  const identities = [
    ...new Set(rawIdentities.map((value) => String(value || '').trim()).filter(Boolean)),
  ]

  try {
    const supabase = getServiceSupabaseClient()
    let remaining = options.limit

    for (const identity of identities) {
      const { data, error } = await supabase.rpc('check_api_rate_limit', {
        p_scope: options.scope,
        p_identity_hash: hashIdentity(identity),
        p_limit: options.limit,
        p_window_seconds: options.windowSeconds,
      })

      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as RateLimitRpcRow | null
      if (!row || typeof row.allowed !== 'boolean') {
        throw new Error('Invalid rate-limit response')
      }

      remaining = Math.min(remaining, Number(row.remaining || 0))
      if (!row.allowed) {
        const retryAfterSeconds = Math.max(Number(row.retry_after_seconds || 1), 1)
        logServerEvent({
          event: 'security.rate_limit_blocked',
          level: 'warn',
          request,
          context: { scope: options.scope, retryAfterSeconds },
        })
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds,
          response: rateLimitResponse(
            options.message || 'Too many requests. Please wait before trying again.',
            retryAfterSeconds,
          ),
        }
      }
    }

    return { allowed: true, remaining, retryAfterSeconds: 0 }
  } catch (error) {
    if (options.unavailable === 'allow') {
      logServerEvent({
        event: 'telemetry.rate_limit_unavailable',
        level: 'warn',
        request,
        error,
        context: { scope: options.scope },
      })
      return { allowed: true, remaining: 0, retryAfterSeconds: 0 }
    }

    await reportOperationalError({
      event: 'security.rate_limit_unavailable',
      request,
      error,
      alert: true,
      context: { scope: options.scope },
    })
    return { allowed: false, remaining: 0, retryAfterSeconds: 30, response: unavailableResponse() }
  }
}
