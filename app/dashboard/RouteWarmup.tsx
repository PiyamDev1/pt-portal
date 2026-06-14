/**
 * Dashboard route warmup.
 *
 * Next.js prefetches visible links, but mobile users often jump between the same
 * operational modules from the footer. This quietly warms those routes after the
 * current page settles so the next tap feels less like a cold navigation.
 */
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const WARM_ROUTES = [
  '/dashboard',
  '/dashboard/timeclock',
  '/dashboard/bookings',
  '/dashboard/frappe-transfer',
  '/dashboard/training',
  '/dashboard/applications',
  '/dashboard/lms',
  '/dashboard/settings',
]

export function RouteWarmup() {
  const router = useRouter()

  useEffect(() => {
    const warm = () => {
      for (const route of WARM_ROUTES) {
        router.prefetch(route)
      }
    }

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(warm, { timeout: 2500 })
      return () => window.cancelIdleCallback(idleId)
    }

    const timeoutId = globalThis.setTimeout(warm, 1200)
    return () => globalThis.clearTimeout(timeoutId)
  }, [router])

  return null
}
