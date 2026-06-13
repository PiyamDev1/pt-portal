/**
 * Verify 2FA Page
 * Verifies TOTP codes or backup codes to complete sign-in.
 *
 * @module app/login/verify-2fa/page
 */

'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { Shield, Loader2 } from 'lucide-react'

export default function Verify2FAPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const recordTwoFactorEvent = async (
    status: 'success' | 'failed',
    metadata: Record<string, unknown> = {},
  ) => {
    await fetch('/api/auth/security-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'two_factor', status, metadata }),
    }).catch(() => undefined)
  }

  const handleBackToLogin = async () => {
    await supabase.auth.signOut().catch(() => undefined)
    router.push('/login')
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    // Try MFA first, then fallback to backup codes if MFA isn't available or fails
    try {
      const userResp = await supabase.auth.getUser()
      const user = userResp?.data?.user
      if (!user) {
        setError('No active session. Please sign in again.')
        return
      }

      if (!useBackup) {
        // Try authenticator code first
        let triedMfa = false
        try {
          const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
          if (!listError && factors?.all?.length) {
            triedMfa = true
            const factorId = factors.all[0].id
            const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
              factorId,
              code,
            })
            if (!verifyError) {
              await recordTwoFactorEvent('success', { method: 'totp' })
              window.history.replaceState(null, '', '/dashboard')
              router.push('/dashboard')
              return
            }
          }
        } catch (mfaErr) {
          // ignore and fall back
        }
        // If failed, show error and suggest backup code
        await recordTwoFactorEvent('failed', { method: triedMfa ? 'totp' : 'totp_unavailable' })
        setError('Incorrect 2FA code. You can also try a backup code below.')
      } else {
        // Try backup code
        const resp = await fetch('/api/auth/consume-backup-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        if (resp.ok) {
          window.history.replaceState(null, '', '/dashboard')
          router.push('/dashboard')
          return
        }
        setError('Invalid or used backup code. Please try again.')
      }
    } catch (e) {
      setError('Verification failed. Please try again.')
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f5f5] text-slate-950">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(139,30,45,0.12),_transparent_30%),linear-gradient(135deg,_#f7fbf7_0%,_#f1e7e9_45%,_#f8fafc_100%)]" />
      <div className="pointer-events-none absolute right-[-8rem] top-[-10rem] h-80 w-80 rounded-full bg-red-200/30 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 items-center gap-8 px-5 py-10 lg:grid-cols-[1fr_440px] lg:px-8">
        <section className="hidden lg:block rounded-[2rem] border border-red-100 bg-white/90 p-10 shadow-2xl shadow-red-950/10 backdrop-blur">
          <div className="flex items-center gap-3 rounded-3xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm">
            <Shield className="h-4 w-4" />
            IMS secure access
          </div>
          <div className="mt-10">
            <h1 className="text-4xl font-black tracking-tight text-slate-950">Confirm your identity</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              Enter your authenticator code or a backup code to complete secure sign-in to the IMS dashboard.
            </p>
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-white/80 bg-white/95 p-8 shadow-2xl shadow-slate-900/10 backdrop-blur md:p-10">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-3xl bg-[#4b0f16] text-white shadow-lg mb-4">
              <Shield className="h-6 w-6" />
            </div>
            <h2 className="text-2xl font-black text-slate-950">Two-Factor Authentication</h2>
            <p className="mt-2 text-sm text-slate-600">Prove it's you to finish signing in to Piyam Travels IMS.</p>
          </div>
          {!useBackup ? (
            <>
              <p className="text-slate-500 mb-6 text-sm">
                Open your authenticator app and enter the 6‑digit code for <strong>Piyam Travels</strong>.
              </p>

              <form onSubmit={handleVerify} className="space-y-6">
                <input
                  type="text"
                  placeholder="000 000"
                  maxLength={6}
                  autoFocus
                  className="w-full text-center text-3xl tracking-[0.5em] p-3 border border-slate-300 rounded-2xl focus:ring-4 focus:ring-red-100 outline-none font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />

                {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded">{error}</div>}

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-[1.75rem] bg-[#4b0f16] px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-xl transition hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>Verify identity</span>
                </button>
              </form>

              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="text-sm text-[#8b1e2d] hover:underline"
                  onClick={() => {
                    setUseBackup(true)
                    setError('')
                    setCode('')
                  }}
                >
                  Use a backup code
                </button>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-sm text-slate-400 hover:text-slate-600"
                >
                  Back to Login
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-slate-500 mb-6 text-sm">Enter one of your single-use backup codes.</p>

              <form onSubmit={handleVerify} className="space-y-6">
                <input
                  type="text"
                  placeholder="Backup code"
                  maxLength={32}
                  autoFocus
                  className="w-full text-center text-xl p-3 border border-slate-300 rounded-2xl focus:ring-4 focus:ring-red-100 outline-none font-mono"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />

                {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded">{error}</div>}

                <button
                  type="submit"
                  className="flex w-full items-center justify-center gap-2 rounded-[1.75rem] bg-[#4b0f16] px-5 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-xl transition hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>Verify with backup code</span>
                </button>
              </form>

              <div className="mt-4 flex flex-col items-center gap-2">
                <button
                  type="button"
                  className="text-sm text-[#8b1e2d] hover:underline"
                  onClick={() => {
                    setUseBackup(false)
                    setError('')
                    setCode('')
                  }}
                >
                  Use authenticator app
                </button>
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-sm text-slate-400 hover:text-slate-600"
                >
                  Back to Login
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
