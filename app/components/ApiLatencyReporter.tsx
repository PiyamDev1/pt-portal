/**
 * API latency reporter.
 *
 * Captures slow same-origin API calls from the browser and forwards a small,
 * low-sensitivity metric to the existing vitals endpoint. This helps identify
 * whether perceived lag is caused by client rendering or backend/API waits.
 */
'use client'

import { useEffect } from 'react'

const SLOW_API_THRESHOLD_MS = 700

export function getReportableApiPath(
  input: RequestInfo | URL,
  currentOrigin: string,
): string | null {
  const rawUrl = typeof input === 'string' || input instanceof URL ? input.toString() : input.url

  try {
    const url = new URL(rawUrl, currentOrigin)
    if (url.origin !== currentOrigin || !url.pathname.startsWith('/api/')) return null
    return url.pathname
  } catch {
    return null
  }
}

export function ApiLatencyReporter() {
  useEffect(() => {
    const originalFetch = window.fetch.bind(window)

    window.fetch = async (input, init) => {
      const startedAt = performance.now()
      const response = await originalFetch(input, init)
      const duration = performance.now() - startedAt
      const path = getReportableApiPath(input, window.location.origin)

      if (duration >= SLOW_API_THRESHOLD_MS && path && !path.startsWith('/api/vitals')) {
        originalFetch('/api/vitals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'api-latency',
            value: Math.round(duration),
            path,
            status: response.status,
            rating: duration > 1500 ? 'poor' : 'needs-improvement',
            navigationType: 'fetch',
            timestamp: Date.now(),
          }),
          keepalive: true,
        }).catch(() => {})
      }

      return response
    }

    return () => {
      window.fetch = originalFetch
    }
  }, [])

  return null
}
