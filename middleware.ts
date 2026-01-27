import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Simple in-memory token bucket per IP. Note: ephemeral in serverless environments.
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 60

type Bucket = { tokens: number; updatedAt: number }
const buckets = new Map<string, Bucket>()

function keyFromRequest(req: NextRequest) {
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown'
  const ua = req.headers.get('user-agent') || 'ua'
  return `${ip}:${ua}`
}

function allowRequest(key: string) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket) {
    buckets.set(key, { tokens: RATE_LIMIT_MAX_REQUESTS - 1, updatedAt: now })
    return true
  }
  const elapsed = now - bucket.updatedAt
  if (elapsed > RATE_LIMIT_WINDOW_MS) {
    bucket.tokens = RATE_LIMIT_MAX_REQUESTS - 1
    bucket.updatedAt = now
    return true
  }
  if (bucket.tokens <= 0) return false
  bucket.tokens -= 1
  return true
}

export const config = {
  matcher: ['/app/api/:path*', '/api/:path*'],
}

export function middleware(req: NextRequest) {
  const key = keyFromRequest(req)
  const allowed = allowRequest(key)
  if (allowed) return NextResponse.next()
  return new NextResponse('Too Many Requests', {
    status: 429,
    headers: {
      'Retry-After': '60',
    },
  })
}
