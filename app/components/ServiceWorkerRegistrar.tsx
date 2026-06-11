/**
 * Registers the IMS service worker required for mobile app installation.
 */

'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // PWA install still works in some browsers without this; avoid noisy UI errors.
    })
  }, [])

  return null
}
