'use client'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function NewPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  // New: We need email to re-login
  const [userEmail, setUserEmail] = useState('')
  const [userId, setUserId] = useState('')
  const router = useRouter()
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Get the current user ID on load
  useEffect(() => {
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)
      if (user) {
        setUserId(user.id)
        setUserEmail(user.email || '') // Store email for re-login
      } else router.push('/login')
    }
    getUser()
  }, [])

  const validatePassword = (pwd: string) => {
    const errors = []
    if (pwd.length < 8) errors.push('at least 8 characters')
    if (!/[a-z]/.test(pwd)) errors.push('a lowercase letter')
    if (!/[A-Z]/.test(pwd)) errors.push('an uppercase letter')
    if (!/[0-9]/.test(pwd)) errors.push('a number')
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+\\/\[\];']/.test(pwd)) errors.push('a special character')
    return errors
  }

  const getPasswordStrengthIndicator = (pwd: string) => {
    const errors = validatePassword(pwd)
    const strength = 5 - errors.length
    return { strength, errors }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return alert("Passwords do not match")
    const pwdErrors = validatePassword(password)
    if (pwdErrors.length > 0) return alert('Password must contain: ' + pwdErrors.join(', '))
    
    setLoading(true)

    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, newPassword: password }),
    })

    const data = await res.json()
    
    if (res.ok) {
      // 2. CRITICAL FIX: Re-Login automatically to get a new Session
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: password
      })

      if (loginError) {
        alert("Password updated, but auto-login failed. Please sign in manually.")
        router.push('/login')
      } else {
        // 3. Now we have a valid session -> Go to 2FA
        router.push('/login/setup-2fa')
      }
    } else {
      alert("Error: " + data.error)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-lg border border-red-100">
        <div className="text-center mb-6">
          <div className="h-12 w-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-3 text-2xl">
            🔒
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Security Update Required</h1>
          <p className="text-slate-500 text-sm mt-1">You are using a temporary password. Please set a secure password to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <input 
              type="password" required minLength={6}
              className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-900 outline-none"
              value={password} onChange={e => setPassword(e.target.value)}
            />
            {password && (
              <div className="mt-3 p-3 bg-slate-50 rounded border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 h-1.5 bg-slate-200 rounded overflow-hidden">
                    <div 
                      className={`h-full transition-all ${
                        getPasswordStrengthIndicator(password).strength === 5 ? 'bg-green-500 w-full' :
                        getPasswordStrengthIndicator(password).strength >= 3 ? 'bg-yellow-500 w-3/4' :
                        'bg-red-500 w-1/2'
                      }`}
                    />
                  </div>
                  <span className="text-xs font-bold">
                    {getPasswordStrengthIndicator(password).strength === 5 ? '✓ Strong' :
                     getPasswordStrengthIndicator(password).strength >= 3 ? 'Fair' : 'Weak'}
                  </span>
                </div>
                {getPasswordStrengthIndicator(password).errors.length > 0 && (
                  <div className="text-xs text-slate-600">
                    <p className="font-bold mb-1">Password must contain:</p>
                    <ul className="space-y-0.5">
                      {getPasswordStrengthIndicator(password).errors.map((err, idx) => (
                        <li key={idx}>• {err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
            <input 
              type="password" required minLength={6}
              className="w-full p-3 border rounded focus:ring-2 focus:ring-blue-900 outline-none"
              value={confirm} onChange={e => setConfirm(e.target.value)}
            />
          </div>

          <button 
            type="submit" disabled={loading}
            className="w-full bg-blue-900 text-white py-3 rounded-lg font-bold hover:bg-blue-800 transition"
          >
            {loading ? 'Updating...' : 'Set Password & Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
