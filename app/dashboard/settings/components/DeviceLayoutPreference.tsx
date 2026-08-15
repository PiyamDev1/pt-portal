/** Device-local portal presentation control used for cross-device testing. */
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, RotateCcw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import {
  DEVICE_LAYOUT_COOKIE,
  detectDeviceLayout,
  readDeviceLayoutOverride,
  type DeviceLayout,
} from '@/lib/deviceLayout'

function getAutomaticLayout(): DeviceLayout {
  const browserNavigator = navigator as Navigator & {
    userAgentData?: { platform?: string }
  }

  return detectDeviceLayout({
    userAgent: navigator.userAgent,
    platformHint: browserNavigator.userAgentData?.platform || navigator.platform || '',
  })
}

function writeLayoutCookie(layout: DeviceLayout | null) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = layout
    ? `${DEVICE_LAYOUT_COOKIE}=${layout}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    : `${DEVICE_LAYOUT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`
}

export function DeviceLayoutPreference() {
  const router = useRouter()
  const [currentLayout, setCurrentLayout] = useState<DeviceLayout | null>(null)
  const [manualLayout, setManualLayout] = useState<DeviceLayout | null>(null)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const savedLayout = readDeviceLayoutOverride(document.cookie)
      const effectiveLayout =
        document.documentElement.dataset.deviceLayout === 'mobile' ? 'mobile' : 'desktop'
      setManualLayout(savedLayout)
      setCurrentLayout(effectiveLayout)
    })

    return () => window.cancelAnimationFrame(frame)
  }, [])

  function applyLayout(layout: DeviceLayout) {
    writeLayoutCookie(layout)
    document.documentElement.dataset.deviceLayout = layout
    document.documentElement.dataset.deviceLayoutPreference = 'manual'
    setManualLayout(layout)
    setCurrentLayout(layout)
    toast.success(`${layout === 'mobile' ? 'Mobile' : 'Desktop'} layout enabled on this device`)
    router.refresh()
  }

  function restoreAutomaticLayout() {
    writeLayoutCookie(null)
    const layout = getAutomaticLayout()
    document.documentElement.dataset.deviceLayout = layout
    document.documentElement.dataset.deviceLayoutPreference = 'automatic'
    setManualLayout(null)
    setCurrentLayout(layout)
    toast.success('Layout now follows this device automatically')
    router.refresh()
  }

  if (!currentLayout) {
    return <div className="h-36 animate-pulse rounded-2xl bg-slate-200" aria-hidden="true" />
  }

  const targetLayout: DeviceLayout = currentLayout === 'mobile' ? 'desktop' : 'mobile'
  const CurrentIcon = currentLayout === 'mobile' ? Smartphone : Monitor
  const TargetIcon = targetLayout === 'mobile' ? Smartphone : Monitor

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-[#8b1e2d]">
            <CurrentIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              Device presentation
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              {currentLayout === 'mobile' ? 'Mobile app layout' : 'Desktop webpage layout'}
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {manualLayout
                ? 'Manually selected for this browser.'
                : 'Selected automatically from this device operating system.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => applyLayout(targetLayout)}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#4b0f16] px-4 py-3 text-sm font-black text-white transition hover:bg-[#6f1422]"
          >
            <TargetIcon className="h-5 w-5" aria-hidden="true" />
            Switch to {targetLayout === 'mobile' ? 'Mobile' : 'Desktop'}
          </button>
          {manualLayout && (
            <button
              type="button"
              onClick={restoreAutomaticLayout}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-100"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Use device default
            </button>
          )}
        </div>
      </div>
    </section>
  )
}
