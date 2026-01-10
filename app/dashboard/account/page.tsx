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
  }, [supabase])

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

  // --- ACTION: GENERATE BACKUP CODES ---
  const [showCodes, setShowCodes] = useState<string[] | null>(null)
  const [backupCodeCount, setBackupCodeCount] = useState(0)
  
  useEffect(() => {
    if (!user) return
    const fetchBackupCodeCount = async () => {
      const res = await fetch(`/api/auth/backup-codes/count?userId=${user.id}`)
      if (res.ok) {
        const data = await res.json()
        setBackupCodeCount(data.count || 0)
      }
    }
    fetchBackupCodeCount()
  }, [user])
  
  const handleGenerateBackupCodes = async () => {
    if (!confirm('Generate new backup codes? Previous codes will be invalidated.')) return
    setLoading(true)
    const res = await fetch('/api/auth/generate-backup-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, count: 10 }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowCodes(data.codes || [])
      setBackupCodeCount(10)
    } else {
      alert('Failed to generate backup codes: ' + (data?.error || 'Unknown'))
    }
    setLoading(false)
  }

  const handleDownloadBackupCodes = () => {
    if (!showCodes) return
    const text = 'Piyam Travels - Backup Codes\n' +
                 'Save these codes in a secure location.\n' +
                 'Each code can be used once for 2FA.\n\n' +
                 showCodes.join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backup-codes.txt'
    a.click()
  }

  const handleCopyBackupCodes = async () => {
    if (!showCodes) return
    const text = showCodes.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      alert('Backup codes copied to clipboard!')
    } catch (err) {
      alert('Failed to copy codes')
    }
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
          <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
          Two-Factor Authentication
        </h2>
        
        <div className="flex items-start gap-4">
          <div className="bg-green-50 text-green-700 p-4 rounded-lg border border-green-100 flex-1">
            <p className="font-bold">Status: Active</p>
            <p className="text-sm mt-1">Your account is secured with Google Authenticator.</p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm text-slate-600 mb-3">Lost your phone or need to re-configure?</p>
          <div className="flex gap-3 items-center flex-wrap">
            <button 
              onClick={handleReset2FA}
              disabled={loading}
              className="border border-red-200 text-red-600 bg-red-50 px-4 py-2 rounded hover:bg-red-100 font-medium transition text-sm"
            >
              Re-install 2FA Keys
            </button>
            <button
              onClick={handleGenerateBackupCodes}
              disabled={loading}
              className="border border-slate-200 text-slate-700 bg-white px-4 py-2 rounded hover:bg-slate-50 font-medium transition text-sm"
            >
              Generate Backup Codes
            </button>
          </div>
          
          {!showCodes && backupCodeCount > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
              <p><strong>Remaining backup codes:</strong> {backupCodeCount} unused</p>
            </div>
          )}
          
          {showCodes && (
            <div className="mt-4 p-4 bg-yellow-50 border border-yellow-100 rounded">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold">Backup codes (save these now — shown only once):</p>
                <button
                  onClick={handleCopyBackupCodes}
                  className="text-xs bg-white border border-yellow-200 px-2 py-1 rounded hover:bg-yellow-100 transition"
                >
                  📋 Copy
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {showCodes.map((c, idx) => (
                  <div key={idx} className="font-mono text-sm bg-white p-2 rounded border select-all">{c}</div>
                ))}
              </div>
              <button
                onClick={handleDownloadBackupCodes}
                className="text-xs bg-white border border-yellow-200 px-3 py-1.5 rounded hover:bg-yellow-100 transition"
              >
                ⬇️ Download as Text File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
