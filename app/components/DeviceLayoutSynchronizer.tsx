/**
 * Reconciles the server-selected shell with the browser operating system.
 * A manual Settings preference takes priority over automatic detection.
 */
'use client'

import { useEffect } from 'react'
import { detectDeviceLayout, readDeviceLayoutOverride } from '@/lib/deviceLayout'
import { applyDeviceViewport } from '@/lib/deviceViewport'

function getBrowserPlatformHint() {
  const browserNavigator = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }
  return browserNavigator.userAgentData?.platform || navigator.platform || ''
}

export function DeviceLayoutSynchronizer() {
  useEffect(() => {
    const manualLayout = readDeviceLayoutOverride(document.cookie)
    const layout =
      manualLayout ||
      detectDeviceLayout({
        userAgent: navigator.userAgent,
        platformHint: getBrowserPlatformHint(),
      })

    document.documentElement.dataset.deviceLayout = layout
    document.documentElement.dataset.deviceLayoutPreference = manualLayout ? 'manual' : 'automatic'

    let frame = window.requestAnimationFrame(() => applyDeviceViewport(layout))
    const synchronizeViewport = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => applyDeviceViewport(layout))
    }

    window.addEventListener('resize', synchronizeViewport)
    window.addEventListener('orientationchange', synchronizeViewport)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', synchronizeViewport)
      window.removeEventListener('orientationchange', synchronizeViewport)
    }
  }, [])

  return null
}
