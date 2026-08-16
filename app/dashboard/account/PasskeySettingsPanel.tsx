/**
 * My Account passkey management panel backed by Supabase Auth.
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppDialog } from '@/components/AppDialog'
import { getBrowserSupabaseClient } from '@/lib/auth/browserSupabase'
import {
  getPasskeyErrorMessage,
  registerPasskeyForCurrentUser,
} from '@/lib/auth/passkeyClientActions'
import { isWebAuthnSupported, resetPasskeyPromptDismissal } from '@/lib/auth/webauthnClient'

type Passkey = {
  id: string
  friendly_name?: string
  created_at: string
  last_used_at?: string
}

function passkeyName(passkey: Passkey) {
  return passkey.friendly_name?.trim() || 'Unnamed passkey'
}

export function PasskeySettingsPanel() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [serviceError, setServiceError] = useState('')
  const [supported, setSupported] = useState<boolean | null>(null)
  const supabase = getBrowserSupabaseClient()
  const { confirm, prompt, dialog } = useAppDialog()

  const loadPasskeys = useCallback(async () => {
    setLoading(true)
    setServiceError('')
    try {
      const { data, error } = await supabase.auth.passkey.list()
      if (error) throw error
      setPasskeys(data || [])
    } catch (error: unknown) {
      const message = getPasskeyErrorMessage(error, 'Unable to load your passkeys')
      setServiceError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    setSupported(isWebAuthnSupported())
    void loadPasskeys()
  }, [loadPasskeys])

  const addPasskey = async () => {
    const friendlyName = await prompt({
      title: 'Name this passkey',
      message: 'Use a name that will help you recognise its device or password manager later.',
      label: 'Passkey name',
      placeholder: 'e.g. Pixel 8 Pro or 1Password',
      confirmLabel: 'Add passkey',
    })
    if (friendlyName === null) return

    setBusyId('new')
    try {
      await registerPasskeyForCurrentUser(friendlyName)
      resetPasskeyPromptDismissal()
      await loadPasskeys()
    } catch (error: unknown) {
      toast.error(getPasskeyErrorMessage(error, 'Unable to add passkey'))
    } finally {
      setBusyId(null)
    }
  }

  const renamePasskey = async (passkey: Passkey) => {
    const friendlyName = await prompt({
      title: 'Rename passkey',
      message: 'Use a name that helps you recognise the device or password manager.',
      label: 'Passkey name',
      initialValue: passkeyName(passkey),
      placeholder: 'e.g. Pixel 8 Pro',
      confirmLabel: 'Save name',
    })
    if (!friendlyName) return
    if (friendlyName.length > 120) {
      toast.error('Passkey names must be 120 characters or fewer.')
      return
    }

    setBusyId(passkey.id)
    try {
      const { error } = await supabase.auth.passkey.update({
        passkeyId: passkey.id,
        friendlyName,
      })
      if (error) throw error
      toast.success('Passkey renamed')
      await loadPasskeys()
    } catch (error: unknown) {
      toast.error(getPasskeyErrorMessage(error, 'Unable to rename passkey'))
    } finally {
      setBusyId(null)
    }
  }

  const deletePasskey = async (passkey: Passkey) => {
    const isLastPasskey = passkeys.length === 1
    const approved = await confirm({
      title: isLastPasskey ? 'Remove your last passkey?' : 'Remove passkey?',
      message: isLastPasskey
        ? 'You will need your password and authenticator code to sign in after removing this passkey.'
        : `Remove “${passkeyName(passkey)}” from your account?`,
      confirmLabel: 'Remove passkey',
      type: 'danger',
    })
    if (!approved) return

    setBusyId(passkey.id)
    try {
      const { error } = await supabase.auth.passkey.delete({ passkeyId: passkey.id })
      if (error) throw error
      toast.success('Passkey removed')
      await loadPasskeys()
    } catch (error: unknown) {
      toast.error(getPasskeyErrorMessage(error, 'Unable to remove passkey'))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold text-slate-800">
            <KeyRound className="h-5 w-5 text-sky-700" />
            Passkeys
          </h2>
          <p className="text-sm leading-6 text-slate-600">
            Sign in without entering your email or password. Your fingerprint, face, device PIN,
            password manager, or security key unlocks a private key that never leaves its secure
            provider.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadPasskeys()}
          disabled={loading}
          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
          aria-label="Refresh passkeys"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {supported === false && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This browser does not support passkeys. Use a current version of Chrome, Edge, Safari, or
          Firefox on a device with WebAuthn support.
        </div>
      )}

      {serviceError && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {serviceError}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {passkeys.map((passkey) => (
          <div
            key={passkey.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="rounded-xl bg-white p-2 text-sky-700 shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{passkeyName(passkey)}</p>
                <p className="text-xs text-slate-500">
                  Added {new Date(passkey.created_at).toLocaleDateString('en-GB')}
                  {passkey.last_used_at
                    ? ` · Last used ${new Date(passkey.last_used_at).toLocaleDateString('en-GB')}`
                    : ' · Not used yet'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={() => void renamePasskey(passkey)}
                disabled={busyId !== null}
                className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60 sm:flex-none"
              >
                <Pencil className="h-4 w-4" />
                Rename
              </button>
              <button
                type="button"
                onClick={() => void deletePasskey(passkey)}
                disabled={busyId !== null}
                className="flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60 sm:flex-none"
                aria-label={`Remove ${passkeyName(passkey)}`}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
            </div>
          </div>
        ))}

        {!loading && !serviceError && passkeys.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            No native passkeys are registered yet. Existing biometric shortcuts from the previous
            preview must be enrolled again once using the new secure passkey service.
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => void addPasskey()}
        disabled={supported !== true || busyId !== null || Boolean(serviceError)}
        className="mt-5 flex min-h-11 items-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        {busyId === 'new' ? 'Opening passkey provider…' : 'Add a passkey'}
      </button>

      <p className="mt-3 text-xs leading-5 text-slate-500">
        If authenticator-app MFA is enabled, Supabase requires a recent TOTP verification before
        passkeys can be added or removed.
      </p>
      {dialog}
    </div>
  )
}
