/**
 * Mobile install prompt for IMS PWA.
 */

'use client'

import { useEffect, useState } from 'react'
import { Download, PlusSquare, Share2, X } from 'lucide-react'
import { isIosDevice, isMobileDevice, isStandalonePwa } from '@/lib/auth/webauthnClient'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const INSTALL_DISMISSED_KEY = 'pt-ims-pwa-install-dismissed'

export function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!isMobileDevice() || isStandalonePwa()) return
    if (window.localStorage.getItem(INSTALL_DISMISSED_KEY) === '1') return

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)

    if (isIosDevice()) {
      const timeout = window.setTimeout(() => setVisible(true), 1600)
      return () => {
        window.clearTimeout(timeout)
        window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  const dismiss = () => {
    window.localStorage.setItem(INSTALL_DISMISSED_KEY, '1')
    setVisible(false)
  }

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') {
      dismiss()
    }
  }

  if (!visible) return null

  const ios = isIosDevice()

  return (
    <div className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-md rounded-3xl border border-emerald-200 bg-white p-4 shadow-2xl shadow-emerald-950/20">
      <button
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss install prompt"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3 pr-8">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          {ios ? <Share2 className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </div>
        <div>
          <p className="font-bold text-slate-950">
            {ios ? 'Add IMS to your iPhone' : 'Install IMS on your phone'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {ios
              ? 'iOS does not allow websites to trigger install directly. Use Safari’s share menu to add IMS.'
              : 'Add IMS to your home screen for faster mobile access.'}
          </p>
        </div>
      </div>

      {ios && (
        <div className="mt-4 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white font-black text-emerald-700">
              1
            </span>
            <span className="font-semibold">Open this page in Safari.</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white font-black text-emerald-700">
              2
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              Tap Share <Share2 className="h-4 w-4" />.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white font-black text-emerald-700">
              3
            </span>
            <span className="flex items-center gap-1.5 font-semibold">
              Choose Add to Home Screen <PlusSquare className="h-4 w-4" />.
            </span>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {ios ? (
          <button
            onClick={dismiss}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white"
          >
            Got it
          </button>
        ) : (
          <button
            onClick={() => void install()}
            disabled={!installEvent}
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            Install app
          </button>
        )}
        <button
          onClick={dismiss}
          className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
