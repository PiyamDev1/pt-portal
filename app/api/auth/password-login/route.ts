import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getLoginGuard, recordAuthSecurityEventStrict } from '@/lib/auth/securityEvents'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
}

const passwordLoginSchema = z.object({
  email: z
    .string({ error: 'Valid email required' })
    .trim()
    .email('Valid email required')
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string({ error: 'Password required' }).min(1, 'Password required').max(1_000),
})

function noStoreError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return apiError(message, status, extra, { headers: NO_STORE_HEADERS })
}

/**
 * Authenticate passwords on the server so only verified Supabase outcomes can
 * affect the shared login-failure window. The short-lived token pair is the
 * minimum the browser SDK needs to establish the user's local session.
 */
export async function POST(request: Request) {
  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      passwordLoginSchema,
      { maxBytes: 4 * 1024 },
    )
    if (bodyError || !body) {
      return noStoreError(bodyError || 'Email and password required', 400)
    }

    const ipLimit = await enforceRateLimit(request, {
      scope: 'auth.password-login.ip',
      limit: 50,
      windowSeconds: 15 * 60,
      identities: [`ip:${getClientIp(request)}`],
      message: 'Too many login attempts. Please wait before trying again.',
    })
    if (!ipLimit.allowed) return ipLimit.response

    const emailLimit = await enforceRateLimit(request, {
      scope: 'auth.password-login.email',
      limit: 5,
      windowSeconds: 15 * 60,
      identities: [`email:${body.email}`],
      message: 'Too many login attempts. Please wait before trying again.',
    })
    if (!emailLimit.allowed) return emailLimit.response

    const guard = await getLoginGuard(body.email)
    if (guard.locked) {
      await recordAuthSecurityEventStrict({
        request,
        email: body.email,
        eventType: 'password_login',
        status: 'blocked',
        metadata: { failedAttempts: guard.failedAttempts },
      })

      return apiError(
        'Too many failed attempts. Please wait before trying again.',
        429,
        { remainingSeconds: guard.remainingSeconds },
        {
          headers: {
            ...NO_STORE_HEADERS,
            'Retry-After': String(Math.max(guard.remainingSeconds, 1)),
          },
        },
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      return noStoreError('Login is temporarily unavailable. Please try again shortly.', 503)
    }

    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    })

    if (error || !data.session || !data.user) {
      await recordAuthSecurityEventStrict({
        request,
        email: body.email,
        eventType: 'password_login',
        status: 'failed',
        metadata: { reason: error ? 'authentication_rejected' : 'session_not_created' },
      })
      return noStoreError('Email or password is incorrect.', 401)
    }

    await recordAuthSecurityEventStrict({
      request,
      userId: data.user.id,
      email: data.user.email || body.email,
      eventType: 'password_login',
      status: 'success',
    })

    return apiOk(
      {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      },
      { headers: NO_STORE_HEADERS },
    )
  } catch {
    return noStoreError('Login is temporarily unavailable. Please try again shortly.', 503)
  }
}
