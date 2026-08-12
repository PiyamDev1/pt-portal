/**
 * Web Vitals Reporter
 * Captures browser performance metrics and forwards them to the vitals API.
 */
'use client'

import { useEffect } from 'react'
import { onCLS, onLCP, onTTFB, onINP, onFCP } from 'web-vitals'
import type { MetricType } from 'web-vitals'

function sendToAnalytics(metric: MetricType) {
  void fetch('/api/vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: metric.name,
      value: metric.value,
      id: metric.id,
      delta: metric.delta,
      rating: metric.rating,
      navigationType: metric.navigationType,
    }),
    keepalive: true,
  }).catch(() => {})
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
