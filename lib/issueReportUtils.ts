/**
 * Issue Report Utilities
 * Helper functions for issue report processing, validation, and enrichment
 * 
 * @module lib/issueReportUtils
 */

/**
 * Regex patterns to redact sensitive data from console logs and stack traces
 * Matches authorization headers, tokens, passwords, secrets, cookies, etc.
 */
const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/(authorization\s*[=:]\s*bearer\s+)[^\s,"]+/gi, '$1[REDACTED]'],
  [/(bearer\s+)[a-z0-9\-._~+/]+=*/gi, '$1[REDACTED]'],
  [/((?:access|refresh)?_?token\s*[=:]\s*["'])[^"']+(["'])/gi, '$1[REDACTED]$2'],
  [/((?:password|secret|cookie|set-cookie)\s*[=:]\s*["'])[^"']+(["'])/gi, '$1[REDACTED]$2'],
]

/**
 * Issue severity levels (low to critical)
 */
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical'
/**
 * Issue lifecycle statuses
 */
export type IssueStatus = 'new' | 'investigating' | 'solved' | 'closed'

/**
 * Redact sensitive text (auth tokens, passwords, secrets)
 * @param value The text to redact
 * @returns The text with sensitive values replaced with [REDACTED]
 */
export function redactSensitiveText(value: string) {
  return REDACTION_PATTERNS.reduce(
    (output, [pattern, replacement]) => output.replace(pattern, replacement),
    value,
  )
}

export function normalizeIssueNotes(value: unknown) {
  return redactSensitiveText(String(value || ''))
    .trim()
    .slice(0, 4000)
}

export function normalizeSeverity(value: unknown): IssueSeverity {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'low' || normalized === 'high' || normalized === 'critical') {
    return normalized
  }
  return 'medium'
}

export function normalizeStatus(value: unknown): IssueStatus {
  const normalized = String(value || '').toLowerCase()
  if (normalized === 'investigating' || normalized === 'solved' || normalized === 'closed') {
    return normalized
  }
  return 'new'
}

export function deriveModuleFromPath(pathname: string) {
  if (!pathname) return 'unknown'

  const checks: Array<[string, string]> = [
    ['/dashboard/timeclock', 'timeclock'],
    ['/dashboard/applications/nadra', 'nadra'],
    ['/dashboard/applications/passports-gb', 'passports-gb'],
    ['/dashboard/applications/passports', 'passports'],
    ['/dashboard/applications/visa', 'visa'],
    ['/dashboard/lms', 'lms'],
    ['/dashboard/settings', 'settings'],
    ['/dashboard/account', 'account'],
    ['/dashboard/pricing', 'pricing'],
    ['/login', 'login'],
  ]

  const matched = checks.find(([prefix]) => pathname.startsWith(prefix))
  if (matched) {
    return matched[1]
  }

  const segments = pathname.split('/').filter(Boolean)
  return segments[1] || segments[0] || 'unknown'
}

export function parseDataUrl(input: string) {
  const match = /^data:(.+);base64,(.+)$/u.exec(input)
  if (!match) {
    throw new Error('Invalid data URL payload')
  }

  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

export function sanitizeConsoleEntries(input: unknown) {
  if (!Array.isArray(input)) return []

  return input
    .slice(-200)
    .map((entry) => {
      const item =
        typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {}
      return {
        level: String(item.level || 'log').slice(0, 20),
        message: redactSensitiveText(String(item.message || '')).slice(0, 4000),
        stack: redactSensitiveText(String(item.stack || '')).slice(0, 8000),
        timestamp: String(item.timestamp || new Date().toISOString()),
        source: String(item.source || 'console').slice(0, 50),
      }
    })
    .filter((entry) => entry.message)
}

export function sanitizeFailedRequests(input: unknown) {
  if (!Array.isArray(input)) return []

  return input
    .slice(-20)
    .map((item) => {
      const entry =
        typeof item === 'object' && item !== null ? (item as Record<string, unknown>) : {}
      return {
        url: redactSensitiveText(String(entry.url || '')).slice(0, 1500),
        method: String(entry.method || 'GET')
          .toUpperCase()
          .slice(0, 10),
        status: Number(entry.status || 0),
        statusText: redactSensitiveText(String(entry.statusText || '')).slice(0, 200),
        durationMs: Number(entry.durationMs || 0),
        timestamp: String(entry.timestamp || new Date().toISOString()),
        source: String(entry.source || 'fetch').slice(0, 20),
        responsePreview: redactSensitiveText(String(entry.responsePreview || '')).slice(0, 1000),
      }
    })
    .filter((entry) => entry.url)
}
