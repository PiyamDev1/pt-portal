'use client'

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error'

export type CapturedConsoleEntry = {
  level: ConsoleLevel
  message: string
  stack?: string
  timestamp: string
  source: 'console' | 'window-error' | 'unhandled-rejection'
}

const MAX_ENTRIES = 200
const entries: CapturedConsoleEntry[] = []

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

export function startConsoleCapture() {
  if (typeof window === 'undefined' || (window as any).__issueReporterConsolePatched) {
    return
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
