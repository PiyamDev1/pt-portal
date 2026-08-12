/**
 * Request Proxy Middleware
 * Adds a correlation ID to API requests and responses.
 *
 * Sensitive endpoints use the shared Postgres-backed limiter in their route
 * handlers. An in-memory middleware bucket is intentionally avoided because
 * it resets per process and cannot enforce a production limit across replicas.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const config = {
  matcher: ['/app/api/:path*', '/api/:path*'],
}

export function proxy(req: NextRequest) {
  const requestId = req.headers.get('x-request-id')?.trim() || crypto.randomUUID()
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', requestId)

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  })
  response.headers.set('x-request-id', requestId)
  return response
}
