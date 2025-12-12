'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Verify2FAPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 1. Get the user's available factors
    const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
    
    if (listError || !factors?.all?.length) {
      setError('No 2FA device found. Please contact support.')
      return
    }

    // 2. Verify the code against the first enrolled factor
    // (In the future if you allow multiple devices, you'd let them pick one)
    const factorId = factors.all[0].id

    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    })

    if (error) {
      setError('Incorrect code. Please try again.')
    } else {
      router.push('/dashboard')
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
          onClick={() => router.push('/login')}
          className="mt-6 text-sm text-slate-400 hover:text-slate-600"
        >
          Back to Login
        </button>
      </div>
    </div>
  )
}