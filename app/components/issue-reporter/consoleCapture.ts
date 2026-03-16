'use client'

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error'

export type CapturedConsoleEntry = {
  level: ConsoleLevel
  message: string
  stack?: string
  timestamp: string
  source: 'console' | 'window-error' | 'unhandled-rejection'
}

export type CapturedFailedRequest = {
  url: string
  method: string
  status: number
  statusText: string
  durationMs: number
  timestamp: string
  source: 'fetch'
  responsePreview?: string
}

const MAX_ENTRIES = 200
const entries: CapturedConsoleEntry[] = []
const MAX_FAILED_REQUESTS = 20
const failedRequests: CapturedFailedRequest[] = []

function safeStringify(value: unknown): string {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return Object.prototype.toString.call(value)
  }
}

function pushEntry(entry: CapturedConsoleEntry) {
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) {
    entries.splice(0, entries.length - MAX_ENTRIES)
  }
}

function pushFailedRequest(entry: CapturedFailedRequest) {
  failedRequests.push(entry)
  if (failedRequests.length > MAX_FAILED_REQUESTS) {
    failedRequests.splice(0, failedRequests.length - MAX_FAILED_REQUESTS)
  }
}

export function startConsoleCapture() {
  if (typeof window === 'undefined' || (window as any).__issueReporterConsolePatched) {
    return
  }

  const originalFetch = window.fetch.bind(window)
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const startedAt = performance.now()
    const timestamp = new Date().toISOString()
    const request = args[0]
    const init = args[1]
    const method = (init?.method || (request instanceof Request ? request.method : 'GET') || 'GET').toUpperCase()
    const url = typeof request === 'string'
      ? request
      : request instanceof URL
        ? request.toString()
        : request.url

    try {
      const response = await originalFetch(...args)
      if (!response.ok) {
        let preview = ''
        try {
          preview = (await response.clone().text()).slice(0, 600)
        } catch {
          preview = ''
        }

        pushFailedRequest({
          url,
          method,
          status: response.status,
          statusText: response.statusText || 'Request failed',
          durationMs: Math.round(performance.now() - startedAt),
          timestamp,
          source: 'fetch',
          responsePreview: preview,
        })
      }
      return response
    } catch (error: any) {
      pushFailedRequest({
        url,
        method,
        status: 0,
        statusText: error?.message || 'Network error',
        durationMs: Math.round(performance.now() - startedAt),
        timestamp,
        source: 'fetch',
      })
      throw error
    }
  }

  ;(['log', 'info', 'warn', 'error'] as ConsoleLevel[]).forEach((level) => {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      pushEntry({
        level,
        message: args.map((arg) => safeStringify(arg)).join(' '),
        stack: args.find((arg) => arg instanceof Error) instanceof Error ? (args.find((arg) => arg instanceof Error) as Error).stack : undefined,
        timestamp: new Date().toISOString(),
        source: 'console',
      })
      original(...args)
    }
  })

  window.addEventListener('error', (event) => {
    pushEntry({
      level: 'error',
      message: event.message || 'Window error',
      stack: event.error?.stack,
      timestamp: new Date().toISOString(),
      source: 'window-error',
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error ? `${event.reason.name}: ${event.reason.message}` : safeStringify(event.reason)
    pushEntry({
      level: 'error',
      message: reason,
      stack: event.reason instanceof Error ? event.reason.stack : undefined,
      timestamp: new Date().toISOString(),
      source: 'unhandled-rejection',
    })
  })

  ;(window as any).__issueReporterConsolePatched = true
}

export function getRecentConsoleEntries() {
  return entries.slice(-MAX_ENTRIES)
}

export function getRecentFailedRequests() {
  return failedRequests.slice(-MAX_FAILED_REQUESTS)
}
