import { randomUUID } from 'node:crypto'

export type ServerLogLevel = 'info' | 'warn' | 'error'

type ServerEventInput = {
  event: string
  level?: ServerLogLevel
  request?: Request | null
  requestId?: string | null
  error?: unknown
  context?: Record<string, unknown>
}

const REDACTED = '[REDACTED]'
const SENSITIVE_KEY =
  /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|verification[-_]?code|backup[-_]?code|totp|otp|session)/i
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/
const TEXT_SCAN_BUFFER = 1_024
const TEXT_REDACTION_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  // Authorization credentials can appear in headers, exception messages, and SDK errors.
  [
    /((?:^|[^A-Za-z0-9_-])["']?authorization["']?\s*(?:=|:)\s*)(?:(?:bearer|basic)\s+)?(?!\[REDACTED\])(?:"[^"]*"|'[^']*'|[^\s,;"'<>]+)/gim,
    `$1${REDACTED}`,
  ],
  [/(\bbearer\s+)[^\s,;"'<>]+/gi, `$1${REDACTED}`],
  // Query strings frequently include OAuth codes and access credentials under otherwise-safe keys.
  [
    /([?&#](?:access[-_]?token|refresh[-_]?token|id[-_]?token|token|api[-_]?key|service[-_]?role[-_]?key|private[-_]?key|password|passwd|secret|client[-_]?secret|verification[-_]?code|backup[-_]?code|totp|otp|session|code)=)(?!\[REDACTED\])[^&#\s]*/gi,
    `$1${REDACTED}`,
  ],
  // Cover JSON, logfmt, header-like, and ordinary key=value forms, with or without quotes.
  [
    /((?:^|[^A-Za-z0-9_-])["']?(?:cookie|set-cookie|password|passwd|secret|client[-_]?secret|access[-_]?token|refresh[-_]?token|id[-_]?token|token|api[-_]?key|service[-_]?role[-_]?key|private[-_]?key|verification[-_]?code|backup[-_]?code|totp|otp|session)["']?\s*(?:=|:)\s*)(?!\[REDACTED\])(?:"[^"]*"|'[^']*'|[^\s,;}&\]]+)/gim,
    `$1${REDACTED}`,
  ],
  // Database and service URLs may embed a password in the authority component.
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^/@\s:]+:)[^@/\s]+(@)/gi, `$1${REDACTED}$2`],
]

function redactTextForLogs(value: string, maxLength: number) {
  // Keep regex work bounded while retaining a buffer so values crossing the output boundary are redacted.
  const bounded = value.slice(0, maxLength + TEXT_SCAN_BUFFER)
  const redacted = TEXT_REDACTION_PATTERNS.reduce(
    (output, [pattern, replacement]) => output.replace(pattern, replacement),
    bounded,
  )
  if (redacted.length <= maxLength) return redacted

  const finalMarkerStart = redacted.lastIndexOf(REDACTED, maxLength)
  if (finalMarkerStart >= 0 && finalMarkerStart + REDACTED.length > maxLength) {
    const safePrefixLength = Math.min(finalMarkerStart, maxLength - REDACTED.length)
    return `${redacted.slice(0, Math.max(0, safePrefixLength))}${REDACTED}`
  }

  return redacted.slice(0, maxLength)
}

function errorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      name: redactTextForLogs(error.name, 200),
      message: redactTextForLogs(error.message, 2_000),
      stack:
        process.env.NODE_ENV === 'development' && error.stack
          ? redactTextForLogs(error.stack, 8_000)
          : undefined,
    }
  }

  if (typeof error === 'string') return { message: redactTextForLogs(error, 2_000) }
  return error == null
    ? undefined
    : { message: 'Non-Error exception', detail: redactForLogs(error) }
}

export function redactForLogs(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MAX_DEPTH]'
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return redactTextForLogs(value, 4_000)

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactForLogs(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => {
          const redactedKey = redactTextForLogs(key, 500)
          return [redactedKey, SENSITIVE_KEY.test(key) ? REDACTED : redactForLogs(item, depth + 1)]
        }),
    )
  }

  return redactTextForLogs(String(value), 1_000)
}

export function getRequestId(request?: Request | null) {
  const supplied = request?.headers.get('x-request-id')?.trim()
  return supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID()
}

export function logServerEvent(input: ServerEventInput) {
  const requestId = input.requestId || getRequestId(input.request)
  const url = input.request ? new URL(input.request.url) : null
  const entry = {
    timestamp: new Date().toISOString(),
    level: input.level || 'info',
    event: input.event,
    requestId,
    method: input.request?.method,
    path: url ? redactTextForLogs(url.pathname, 2_000) : undefined,
    error: errorDetails(input.error),
    context: redactForLogs(input.context || {}),
  }
  const serialized = JSON.stringify(entry)

  if (entry.level === 'error') console.error(serialized)
  else if (entry.level === 'warn') console.warn(serialized)
  else process.stdout.write(`${serialized}\n`)

  return requestId
}

/**
 * Emit a redacted structured error and optionally notify an operations webhook.
 * The webhook URL is server-configured; no request-controlled destination is accepted.
 */
export async function reportOperationalError(
  input: Omit<ServerEventInput, 'level'> & { alert?: boolean },
) {
  const requestId = logServerEvent({ ...input, level: 'error' })
  const webhookUrl = process.env.OBSERVABILITY_ALERT_WEBHOOK_URL?.trim()

  if (input.alert && webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          event: input.event,
          requestId,
          timestamp: new Date().toISOString(),
          context: redactForLogs(input.context || {}),
          error: errorDetails(input.error),
        }),
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      })
    } catch (alertError) {
      logServerEvent({
        event: 'observability.alert_delivery_failed',
        level: 'warn',
        requestId,
        error: alertError,
        context: { sourceEvent: input.event },
      })
    }
  }

  return requestId
}

export function responseWithRequestId(response: Response, requestId: string) {
  response.headers.set('x-request-id', requestId)
  return response
}
