'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Verify2FAPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

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
            const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
            if (!verifyError) {
              window.history.replaceState(null, '', '/dashboard')
              router.push('/dashboard')
              return
            }
          }
        } catch (mfaErr) {
          // ignore and fall back
        }
        // If failed, show error and suggest backup code
        setError('Incorrect 2FA code. You can also try a backup code below.')
      } else {
        // Try backup code
        const resp = await fetch('/api/auth/consume-backup-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, code }),
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="absolute top-4 left-4">
        <Link href="/login" className="flex items-center gap-2 text-blue-600 hover:text-blue-800 text-sm font-medium">
          ← Back to Login
        </Link>
      </div>
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg border border-slate-200 text-center">
        <div className="mx-auto w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
        </div>

        <h2 className="text-2xl font-bold text-slate-800 mb-2">Two-Factor Authentication</h2>
        {!useBackup ? (
          <>
            <p className="text-slate-500 mb-6 text-sm">Open Google Authenticator and enter the code for <strong>Piyam Travels</strong>.</p>
            <form onSubmit={handleVerify} className="space-y-6">
              <input
                type="text"
                placeholder="000 000"
                maxLength={6}
                autoFocus
                className="w-full text-center text-3xl tracking-[0.5em] p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-900 outline-none font-mono"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
              {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded">{error}</div>}
              <button type="submit" className="w-full py-3 bg-blue-900 text-white rounded-lg font-bold hover:bg-blue-800 transition">
                Verify Identity
              </button>
            </form>
            <button
              type="button"
              className="mt-4 text-sm text-blue-700 hover:underline"
              onClick={() => { setUseBackup(true); setError(''); setCode('') }}
            >
              Use backup code
            </button>
          </>
        ) : (
          <>
            <p className="text-slate-500 mb-6 text-sm">Enter one of your backup codes. Each code can only be used once.</p>
            <form onSubmit={handleVerify} className="space-y-6">
              <input
                type="text"
                placeholder="Backup code"
                maxLength={16}
                autoFocus
                className="w-full text-center text-xl p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-900 outline-none font-mono"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
              {error && <div className="p-3 bg-red-50 text-red-600 text-sm rounded">{error}</div>}
              <button type="submit" className="w-full py-3 bg-blue-900 text-white rounded-lg font-bold hover:bg-blue-800 transition">
                Verify with Backup Code
              </button>
            </form>
            <button
              type="button"
              className="mt-4 text-sm text-blue-700 hover:underline"
              onClick={() => { setUseBackup(false); setError(''); setCode('') }}
            >
              Use authenticator app
            </button>
          </>
        )}
        <button
          onClick={() => router.push('/login')}
          className="mt-6 text-sm text-slate-400 hover:text-slate-600"
        >
          Back to Login
        </button>
      </div>
    </div>
  )
}