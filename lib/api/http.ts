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

export function apiOk<T>(payload: T, init?: ResponseInit) {
  return NextResponse.json(payload, init)
}

export function apiError(
  message: string,
  status = 400,
  extra: Record<string, unknown> = {},
  init?: ResponseInit,
) {
  return NextResponse.json({ error: message, ...extra }, { ...init, status })
}
