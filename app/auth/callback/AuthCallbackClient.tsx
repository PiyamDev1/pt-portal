/**
 * Client-side OAuth callback exchange.
 *
 * This component completes the Supabase code exchange in the browser, then
 * replaces the history entry so the callback never becomes a back-button trap.
 */

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { getBrowserSupabaseClient } from '@/lib/auth/browserSupabase'
import { reconcileMicrosoftIdentity } from '@/lib/auth/microsoftIdentity'

type AuthCallbackClientProps = {
  code: string | null
  nextPath: string
  flow: 'sign-in' | 'link-microsoft'
}

function microsoftResultPath(nextPath: string, result: string) {
  return `${nextPath}${nextPath.includes('?') ? '&' : '?'}microsoft=${encodeURIComponent(result)}`
}

export default function AuthCallbackClient({ code, nextPath, flow }: AuthCallbackClientProps) {
  const router = useRouter()
  const supabase = getBrowserSupabaseClient()

  useEffect(() => {
    if (!code) {
      router.replace(
        flow === 'link-microsoft' ? microsoftResultPath(nextPath, 'error') : '/login?error=oauth',
      )
      return
    }

    const exchangeCode = async () => {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        router.replace(
          flow === 'link-microsoft' ? microsoftResultPath(nextPath, 'error') : '/login?error=oauth',
        )
        return
      }

      if (flow === 'link-microsoft') {
        const resolution = await reconcileMicrosoftIdentity(supabase.auth, data.user?.email || '')
        const result =
          resolution.status === 'linked'
            ? 'linked'
            : resolution.status === 'mismatch-removed'
              ? 'email-mismatch'
              : resolution.status === 'review-required'
                ? 'review-required'
                : resolution.status === 'not-linked'
                  ? 'missing'
                  : 'error'

        router.replace(microsoftResultPath(nextPath, result))
        return
      }

      router.replace(nextPath)
    }

    void exchangeCode()
  }, [code, flow, nextPath, router, supabase])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-6 text-slate-950">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white px-8 py-10 shadow-xl">
        <Loader2 className="h-8 w-8 animate-spin text-[#8b1e2d]" />
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[#8b1e2d]">
            {flow === 'link-microsoft' ? 'Linking Microsoft' : 'Completing sign-in'}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {flow === 'link-microsoft'
              ? 'We are verifying your company email and returning you to My Account.'
              : 'We are finishing your Microsoft login and returning you to IMS.'}
          </p>
        </div>
      </div>
    </main>
  )
}
