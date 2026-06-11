/**
 * My Account passkey management panel.
 */

'use client'

import { useEffect, useState } from 'react'
import { ScanFace, RefreshCw, Smartphone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { registerPasskeyForCurrentUser } from '@/lib/auth/passkeyClientActions'
import {
  getMobilePlatformLabel,
  isWebAuthnSupported,
  resetPasskeyPromptDismissal,
} from '@/lib/auth/webauthnClient'

type Passkey = {
  id: string
  name: string
  transports: string[]
  device_type: string | null
  created_at: string
  last_used_at: string | null
}

export function PasskeySettingsPanel() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const supported = isWebAuthnSupported()

  const loadPasskeys = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/auth/passkeys')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load biometric devices')
      setPasskeys(data.passkeys || [])
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to load biometric devices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPasskeys()
  }, [])

  const enablePasskey = async () => {
    setBusy(true)
    try {
      await registerPasskeyForCurrentUser(`${getMobilePlatformLabel()} on this device`)
      resetPasskeyPromptDismissal()
      await loadPasskeys()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to enable biometric login')
    } finally {
      setBusy(false)
    }
  }

  const deletePasskey = async (passkey: Passkey) => {
    setBusy(true)
    try {
      const response = await fetch('/api/auth/passkeys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: passkey.id }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to remove biometric login')
      toast.success('Biometric login removed')
      await loadPasskeys()
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Unable to remove biometric login')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 mb-2 flex items-center gap-2">
            <ScanFace className="h-5 w-5 text-sky-700" />
            Biometric Login
          </h2>
          <p className="text-sm text-slate-600">
            Enable Face ID, Touch ID, Android fingerprint, or your phone screen lock for faster IMS
            login. This stores a passkey on your device and only a public key in IMS.
          </p>
        </div>
        <button
          onClick={() => void loadPasskeys()}
          disabled={loading}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          aria-label="Refresh biometric devices"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!supported && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This browser does not support biometric passkeys. Use Safari on iOS/iPadOS or Chrome on
          Android for the best mobile experience.
        </div>
      )}

      <div className="mt-5 space-y-3">
        {passkeys.map((passkey) => (
          <div
            key={passkey.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-white p-2 text-sky-700">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-900">{passkey.name}</p>
                <p className="text-xs text-slate-500">
                  Added {new Date(passkey.created_at).toLocaleDateString('en-GB')}
                  {passkey.last_used_at
                    ? ` · Last used ${new Date(passkey.last_used_at).toLocaleDateString('en-GB')}`
                    : ''}
                </p>
              </div>
            </div>
            <button
              onClick={() => void deletePasskey(passkey)}
              disabled={busy}
              className="rounded-lg border border-red-200 bg-white p-2 text-red-600 hover:bg-red-50"
              aria-label={`Remove ${passkey.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        {!loading && passkeys.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No biometric login has been enabled yet.
          </div>
        )}
      </div>

      <button
        onClick={() => void enablePasskey()}
        disabled={!supported || busy}
        className="mt-5 rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:opacity-60"
      >
        {busy ? 'Working...' : 'Enable biometric login on this device'}
      </button>
    </div>
  )
}
