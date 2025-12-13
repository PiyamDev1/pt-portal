'use client'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function MyAccountPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Password States
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')

  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUser(user)
    }
    getUser()
  }, [])

  // --- ACTION: CHANGE PASSWORD ---
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPass !== confirmPass) return alert("New passwords do not match")
    // Client-side strong validation to match server rules
    const errs: string[] = []
    if (newPass.length < 8) errs.push('at least 8 characters')
    if (!/[a-z]/.test(newPass)) errs.push('a lowercase letter')
    if (!/[A-Z]/.test(newPass)) errs.push('an uppercase letter')
    if (!/[0-9]/.test(newPass)) errs.push('a number')
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+\\/\[\];']/.test(newPass)) errs.push('a special character')
    if (errs.length) return alert('Password must contain: ' + errs.join(', '))
    
    setLoading(true)

    // 1. Verify Current Password first (Re-Auth)
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPass
    })

    if (signInError) {
      setLoading(false)
      return alert("Incorrect current password.")
    }

    // 2. Update to New Password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPass
    })

    if (updateError) {
      alert("Failed to update password: " + updateError.message)
    } else {
      alert("Password updated successfully!")
      setCurrentPass('')
      setNewPass('')
      setConfirmPass('')
    }
    setLoading(false)
  }

  // --- ACTION: RESET 2FA ---
  const handleReset2FA = async () => {
    if (!confirm("Are you sure? This will disable your current Authenticator codes and require you to setup 2FA again.")) return;
    
    setLoading(true)
    
    const res = await fetch('/api/auth/reset-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })

    if (res.ok) {
      alert("2FA has been reset. Redirecting you to setup...");
      router.push('/login/setup-2fa')
    } else {
      const data = await res.json()
      alert("Failed to reset 2FA: " + (data?.error || 'Unknown'))
    }
    setLoading(false)
  }

  if (!user) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-slate-800">My Account Settings</h1>

      {/* 1. PASSWORD SECTION */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span>🔒</span> Change Password
        </h2>
        
        <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
            <input 
              type="password" required 
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              value={currentPass} onChange={e => setCurrentPass(e.target.value)}
            />
          </div>
          <div className="pt-2 border-t border-slate-100"></div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <input 
              type="password" required minLength={6}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              value={newPass} onChange={e => setNewPass(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
            <input 
              type="password" required minLength={6}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
            />
          </div>

          <button 
            type="submit" disabled={loading}
            className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-medium transition"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* 2. SECURITY & 2FA SECTION */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span>Shield Icon</span> Two-Factor Authentication
        </h2>
        
        <div className="flex items-start gap-4">
          <div className="bg-green-50 text-green-700 p-4 rounded-lg border border-green-100 flex-1">
            <p className="font-bold">Status: Active</p>
            <p className="text-sm mt-1">Your account is secured with Google Authenticator.</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm text-slate-600 mb-3">Lost your phone or need to re-configure?</p>
          <button 
            onClick={handleReset2FA}
            disabled={loading}
            className="border border-red-200 text-red-600 bg-red-50 px-4 py-2 rounded hover:bg-red-100 font-medium transition text-sm"
          >
            Re-install 2FA Keys
          </button>
        </div>
      </div>
    </div>
  )
}
