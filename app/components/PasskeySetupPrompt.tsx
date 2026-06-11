/**
 * Post-login prompt asking mobile users to enable biometric login.
 */

'use client'

import { useEffect, useState } from 'react'
import { ScanFace, X } from 'lucide-react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { toast } from 'sonner'
import { registerPasskeyForCurrentUser } from '@/lib/auth/passkeyClientActions'
import {
  dismissPasskeyPrompt,
  getMobilePlatformLabel,
  hasDismissedPasskeyPrompt,
  isMobileDevice,
  isWebAuthnSupported,
} from '@/lib/auth/webauthnClient'

export function PasskeySetupPrompt() {
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const platformLabel = getMobilePlatformLabel()

  useEffect(() => {
    if (!isMobileDevice() || !isWebAuthnSupported() || hasDismissedPasskeyPrompt()) return

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const response = await fetch('/api/auth/passkeys')
      if (!response.ok) return
      const data = await response.json()
      if ((data.passkeys || []).length === 0) {
        window.setTimeout(() => setVisible(true), 1200)
      }
    }

    void load()
  }, [])

  const close = () => {
    dismissPasskeyPrompt()
    setVisible(false)
  }

  const enable = async () => {
    setLoading(true)
    try {
      await registerPasskeyForCurrentUser()
      setVisible(false)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to enable biometric login')
    } finally {
      setLoading(false)
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-3 bottom-3 z-[65] mx-auto max-w-lg rounded-[1.75rem] border border-sky-200 bg-white p-5 shadow-2xl shadow-sky-950/20">
      <button
        onClick={close}
        className="absolute right-3 top-3 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss biometric login prompt"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-4 pr-8">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
          <ScanFace className="h-6 w-6" />
        </div>
        <div>
          <p className="text-lg font-black text-slate-950">Use {platformLabel} next time?</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            IMS can use your phone&apos;s secure passkey so you can sign in faster next time.
            You can remove it any time from My Account.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => void enable()}
          disabled={loading}
          className="flex-1 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:opacity-60"
        >
          {loading ? 'Opening biometrics...' : 'Enable biometric login'}
        </button>
        <button
          onClick={close}
          className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
