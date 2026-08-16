'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { BadgeCheck, Building2, Loader2, RefreshCw } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import type { SupabaseClient, UserIdentity } from '@supabase/supabase-js'
import type { AuthUser } from '@/app/types/auth'
import {
  getMicrosoftLinkErrorMessage,
  reconcileMicrosoftIdentity,
} from '@/lib/auth/microsoftIdentity'

type MicrosoftIdentityPanelProps = {
  currentUser: AuthUser
  supabase: SupabaseClient
}

const LINK_RESULT_MESSAGES: Record<string, { type: 'success' | 'error'; message: string }> = {
  linked: { type: 'success', message: 'Microsoft work account linked' },
  'email-mismatch': {
    type: 'error',
    message: 'The selected Microsoft email did not match your IMS email, so it was not linked.',
  },
  'review-required': {
    type: 'error',
    message: 'The Microsoft link needs administrator review before it can be used.',
  },
  missing: { type: 'error', message: 'Microsoft did not return a linked work account.' },
  error: { type: 'error', message: 'Microsoft account linking was not completed.' },
}

export function MicrosoftIdentityPanel({ currentUser, supabase }: MicrosoftIdentityPanelProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const handledResult = useRef(false)
  const [identity, setIdentity] = useState<UserIdentity | null>(null)
  const [loading, setLoading] = useState(true)
  const [linking, setLinking] = useState(false)
  const [serviceError, setServiceError] = useState('')

  const loadIdentity = useCallback(async () => {
    setLoading(true)
    setServiceError('')

    const resolution = await reconcileMicrosoftIdentity(supabase.auth, currentUser.email)
    if (resolution.status === 'linked') {
      setIdentity(resolution.identity)
    } else {
      setIdentity(null)
    }

    if (resolution.status === 'mismatch-removed') {
      toast.error('A Microsoft identity with a different email was removed from your account.')
    } else if (resolution.status === 'review-required') {
      setServiceError(
        'A Microsoft identity does not match your IMS email and could not be removed automatically. Contact an administrator before using Microsoft sign-in.',
      )
    } else if (resolution.status === 'unavailable') {
      setServiceError('Unable to load your linked Microsoft account right now.')
    }

    setLoading(false)
  }, [currentUser.email, supabase.auth])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => void loadIdentity())
    return () => window.cancelAnimationFrame(frame)
  }, [loadIdentity])

  useEffect(() => {
    const result = searchParams.get('microsoft')
    if (!result || handledResult.current) return
    handledResult.current = true

    const notification = LINK_RESULT_MESSAGES[result]
    if (notification?.type === 'success') toast.success(notification.message)
    if (notification?.type === 'error') toast.error(notification.message)

    router.replace('/dashboard/settings?tab=security', { scroll: false })
  }, [router, searchParams])

  const linkMicrosoft = async () => {
    setLinking(true)
    setServiceError('')

    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('flow', 'link-microsoft')
    callbackUrl.searchParams.set('next', '/dashboard/settings?tab=security')

    const { error } = await supabase.auth.linkIdentity({
      provider: 'azure',
      options: {
        redirectTo: callbackUrl.toString(),
        scopes: 'email',
        queryParams: {
          login_hint: currentUser.email,
          prompt: 'select_account',
        },
      },
    })

    if (error) {
      const message = getMicrosoftLinkErrorMessage(error)
      setServiceError(message)
      toast.error(message)
      setLinking(false)
    }
  }

  const linkedEmail = identity?.identity_data?.email
  const linkedAt = identity?.created_at

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-sky-50 p-2.5 text-sky-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-800">Microsoft work account</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Link your Microsoft 365 company account to use “Sign in with Microsoft” for this IMS
              account. The Microsoft email must exactly match your IMS email.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadIdentity()}
          disabled={loading || linking}
          className="self-start rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
          aria-label="Refresh linked Microsoft account"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {serviceError && (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {serviceError}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking linked identities…
          </div>
        ) : identity ? (
          <div className="flex items-start gap-3">
            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">Microsoft sign-in is linked</p>
              <p className="mt-1 break-all text-sm text-slate-600">
                {typeof linkedEmail === 'string' ? linkedEmail : currentUser.email}
              </p>
              {linkedAt && (
                <p className="mt-1 text-xs text-slate-500">
                  Linked {new Date(linkedAt).toLocaleDateString('en-GB')}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div>
            <p className="font-semibold text-slate-900">Not linked</p>
            <p className="mt-1 text-sm text-slate-600">
              Expected Microsoft email: <span className="font-medium">{currentUser.email}</span>
            </p>
          </div>
        )}
      </div>

      {!identity && !loading && (
        <button
          type="button"
          onClick={() => void linkMicrosoft()}
          disabled={linking || Boolean(serviceError)}
          className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#741826] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {linking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Building2 className="h-4 w-4" />
          )}
          {linking ? 'Opening Microsoft…' : 'Link Microsoft work account'}
        </button>
      )}

      <p className="mt-3 text-xs leading-5 text-slate-500">
        Linking adds another sign-in method; it does not change your IMS profile, role, branch,
        password, or two-factor requirements.
      </p>
    </section>
  )
}
