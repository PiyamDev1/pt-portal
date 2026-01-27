'use client'

import { useEffect } from 'react'
import { onCLS, onLCP, onTTFB, onINP, onFCP } from 'web-vitals'

function sendToAnalytics(metric: any) {
  try {
    fetch('/app/api/vitals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metric),
      keepalive: true,
    })
  } catch {}
}

export function WebVitalsReporter() {
  useEffect(() => {
    onCLS(sendToAnalytics)
    onFCP(sendToAnalytics)
    onLCP(sendToAnalytics)
    onTTFB(sendToAnalytics)
    onINP && onINP(sendToAnalytics)
  }, [])
  return null
}
