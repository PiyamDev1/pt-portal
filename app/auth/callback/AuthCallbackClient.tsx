/**
 * Client-side OAuth callback exchange.
 *
 * This component completes the Supabase code exchange in the browser, then
 * replaces the history entry so the callback never becomes a back-button trap.
 */

'use client'

import { useEffect } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

type AuthCallbackClientProps = {
  code: string | null
  nextPath: string
}

export default function AuthCallbackClient({ code, nextPath }: AuthCallbackClientProps) {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  useEffect(() => {
    if (!code) {
      router.replace('/login?error=oauth')
      return
    }

    const exchangeCode = async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (error) {
        router.replace('/login?error=oauth')
        return
      }

      router.replace(nextPath)
    }

    void exchangeCode()
  }, [code, nextPath, router, supabase])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f5f5f5] px-6 text-slate-950">
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-200 bg-white px-8 py-10 shadow-xl">
        <Loader2 className="h-8 w-8 animate-spin text-[#8b1e2d]" />
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-[#8b1e2d]">
            Completing sign-in
          </p>
          <p className="mt-2 text-sm text-slate-600">
            We are finishing your Microsoft login and returning you to IMS.
          </p>
        </div>
      </div>
    </main>
  )
}
