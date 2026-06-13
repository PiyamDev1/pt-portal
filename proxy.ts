/**
 * Request Proxy Middleware
 * Applies lightweight in-memory token-bucket rate limiting for API routes.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Simple in-memory token bucket per IP. Note: ephemeral in serverless environments.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 60
const AUTH_RATE_LIMIT_MAX_REQUESTS = 12

type Bucket = { tokens: number; updatedAt: number }
const buckets = new Map<string, Bucket>()

function keyFromRequest(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  const userAgent = req.headers.get('user-agent') || 'ua'
  return `${ip}:${userAgent}`
}

function isAuthRequest(req: NextRequest) {
  return req.nextUrl.pathname.startsWith('/api/auth/')
}

export const config = {
  matcher: ['/app/api/:path*', '/api/:path*'],
}

export function proxy(req: NextRequest) {
  const limit = isAuthRequest(req) ? AUTH_RATE_LIMIT_MAX_REQUESTS : RATE_LIMIT_MAX_REQUESTS
  const key = `${isAuthRequest(req) ? 'auth' : 'api'}:${keyFromRequest(req)}`
  const allowed = allowRequestWithLimit(key, limit)

  if (allowed) {
    return NextResponse.next()
  }

  return new NextResponse('Too Many Requests', {
    status: 429,
    headers: {
      'Retry-After': '60',
    },
  })
}

function allowRequestWithLimit(key: string, maxRequests: number) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket) {
    buckets.set(key, { tokens: maxRequests - 1, updatedAt: now })
    return true
  }

  const elapsed = now - bucket.updatedAt
  if (elapsed > RATE_LIMIT_WINDOW_MS) {
    bucket.tokens = maxRequests - 1
    bucket.updatedAt = now
    return true
  }

  if (bucket.tokens <= 0) return false
  bucket.tokens -= 1
  return true
}
