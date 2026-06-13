/**
 * HTTP response helpers used by API routes across the portal.
 *
 * Why this exists:
 * Route handlers had drifted into slightly different response shapes over time,
 * which made frontend error handling inconsistent. These helpers keep the
 * portal's JSON contract boring and predictable.
 */

import { NextResponse } from 'next/server'

/**
 * Standard API response envelope.
 * Success responses return data directly (no wrapper) with HTTP 2xx.
 * Error responses always return { error: string } with an appropriate HTTP 4xx/5xx.
 */
export type ApiErrorResponse = { error: string }

/**
 * Typed union for callers that want to narrow success vs error without checking HTTP status.
 * Usage: `const data = await res.json() as ApiResponse<MyType>`
 */
export type ApiResponse<T> = T | ApiErrorResponse

/**
 * Return a success payload exactly as the caller provides it.
 *
 * We intentionally do not wrap successful responses in `{ data: ... }`
 * everywhere because a lot of existing route consumers already expect the
 * direct JSON body shape.
 */
export function apiOk<T>(payload: T, init?: ResponseInit) {
  return NextResponse.json(payload, init)
}

/**
 * Return a normalized error payload for both UI callers and integration clients.
 *
 * `extra` is reserved for structured debugging details when a route needs to
 * expose more context than a flat message.
 */
export function apiError(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
  init?: ResponseInit,
) {
  return NextResponse.json({ error: message, ...extra }, { ...init, status })
}
