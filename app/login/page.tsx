'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [branchCode, setBranchCode] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // --- LOGIC: Validate Branch & Redirect ---
  const postLoginChecks = async (userId: string) => {
    // 1. Check database for Branch Code match
    const { data: employee } = await supabase
      .from('employees')
      .select('locations(branch_code)')
      .eq('id', userId)
      .single()

    // @ts-ignore
    const assignedCode = employee?.locations?.branch_code

    // If a branch code was typed, it MUST match the user's assigned location
    if (branchCode && assignedCode !== branchCode) {
      await supabase.auth.signOut()
      throw new Error(`Access Denied: You are not authorized for branch ${branchCode}`)
    }

    // 2. Check 2FA Status
    const { data: mfa } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

    if (mfa?.nextLevel === 'aal2') {
      router.push('/login/verify-2fa')
    } else {
      router.push('/login/setup-2fa')
    }
  }

  // --- HANDLER: Standard Login ---
  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      await postLoginChecks(data.user.id)
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed')
      setLoading(false)
    }
  }

  // --- HANDLER: Microsoft SSO ---
  const handleMicrosoftLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'email',
      },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="w-full max-w-md p-8 bg-white rounded-xl shadow-lg border border-slate-200">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">PT-IMS</h1>
          <p className="text-slate-500">Secure Employee Access</p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded border border-red-200">
            {errorMsg}
          </div>
        )}

        <button
          onClick={handleMicrosoftLogin}
          className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-slate-300 rounded-lg text-slate-700 bg-white hover:bg-slate-50 font-medium transition mb-6"
        >
          <span>Sign in with Microsoft</span>
        </button>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
          <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-slate-500">Or use Branch Credentials</span></div>
        </div>

        <form onSubmit={handleStandardLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input 
              type="email" required 
              className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-600 outline-none"
              value={email} onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input 
              type="password" required 
              className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-600 outline-none"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Branch Code</label>
            <input 
              type="text" required placeholder="e.g. HQ-001"
              className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-blue-600 outline-none uppercase tracking-wide"
              value={branchCode} onChange={e => setBranchCode(e.target.value.toUpperCase())}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="w-full py-3 bg-blue-900 text-white rounded-lg font-bold hover:bg-blue-800 transition disabled:opacity-50"
          >
            {loading ? 'Verifying...' : 'Next Step'}
          </button>
        </form>
      </div>
    </div>
  )
}