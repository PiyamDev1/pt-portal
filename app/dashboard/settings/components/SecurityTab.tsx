'use client'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { getDeviceInfo, getPasswordStrengthIndicator, resizeImage } from './utils'

interface SecurityTabProps {
  currentUser: any
  supabase: any
  loading: boolean
  setLoading: (loading: boolean) => void
}

export default function SecurityTab({ currentUser, supabase, loading, setLoading }: SecurityTabProps) {
  const router = useRouter()
  
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showCodes, setShowCodes] = useState<string[] | null>(null)
  const [backupCodeCount, setBackupCodeCount] = useState(0)
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(true)

  useEffect(() => {
    // Fetch backup code count
    fetch(`/api/auth/backup-codes/count?userId=${currentUser.id}`)
      .then(res => res.json())
      .then(data => setBackupCodeCount(data.count || 0))
      .catch(() => {})

    // Fetch sessions
    setSessionsLoading(true)
    setSessionsError(null)
    fetch('/api/auth/sessions', { credentials: 'include' })
      .then(async res => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to fetch sessions')
        }
        if (data.sessions) setSessions(data.sessions)
        else setSessions([])
      })
      .catch((err) => {
        console.error('Session fetch failed:', err)
        setSessionsError(err.message || 'Unable to load devices')
      })
      .finally(() => setSessionsLoading(false))
  }, [currentUser.id])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPass !== confirmPass) return toast.error("New passwords do not match")

    const { strength, errors } = getPasswordStrengthIndicator(newPass)
    if (errors.length > 0) return toast.error('Password too weak', { description: errors[0] })
    
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPass
    })

    if (signInError) {
      setLoading(false)
      return toast.error("Incorrect current password.")
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPass
    })

    if (updateError) {
      toast.error("Failed to update password: " + updateError.message)
    } else {
      toast.success("Password updated successfully!")
      setCurrentPass('')
      setNewPass('')
      setConfirmPass('')
    }
    setLoading(false)
  }

  const handleReset2FA = async () => {
    if (!confirm("Are you sure? This will disable your current Authenticator codes and require you to setup 2FA again.")) return
    setLoading(true)
    const res = await fetch('/api/auth/reset-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    })
    if (res.ok) {
      toast.success("2FA reset successfully")
      router.push('/login/setup-2fa')
    } else {
      const data = await res.json()
      toast.error("Failed to reset 2FA", { description: data?.error })
    }
    setLoading(false)
  }

  const handleGenerateBackupCodes = async () => {
    if (!confirm('Generate new backup codes? Previous codes will be invalidated.')) return
    setLoading(true)
    const res = await fetch('/api/auth/generate-backup-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, count: 10 }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowCodes(data.codes || [])
      setBackupCodeCount(10)
      toast.success("New backup codes generated")
    } else {
      toast.error('Generation failed', { description: data?.error })
    }
    setLoading(false)
  }

  const handleCopyBackupCodes = async () => {
    if (!showCodes) return
    await navigator.clipboard.writeText(showCodes.join('\n'))
    toast.success('Copied to clipboard')
  }

  const handleDownloadBackupCodes = () => {
    if (!showCodes) return
    const text = 'Piyam Travels - Backup Codes\n' + showCodes.join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backup-codes.txt'
    a.click()
  }

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm("Are you sure you want to log out this device?")) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'single', id: sessionId })
      })
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.id !== sessionId))
        toast.success("Device logged out")
      } else {
        toast.error("Failed to revoke session")
      }
    } catch (err) { toast.error("Network error") }
    setLoading(false)
  }

  const handleSignOutAll = async () => {
    if (!confirm("This will log you out of ALL devices (including this one). Continue?")) return
    setLoading(true)
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'all' })
      })
      if (res.ok) {
        toast.success("All devices signed out. Redirecting...")
        router.push('/login')
      } else {
        toast.error("Failed to sign out all devices")
      }
    } catch (err) { toast.error("Network error") }
    setLoading(false)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    
    const originalFile = e.target.files[0]
    if (!originalFile.type.startsWith('image/')) {
      return toast.error("Invalid file type", { description: "Please upload an image file." })
    }

    setLoading(true)
    const toastId = toast.loading("Processing image...")

    try {
      const maxSizeBytes = 2 * 1024 * 1024
      const sizesToTry = [512, 384, 256]
      let finalBlob: Blob | null = null

      for (const s of sizesToTry) {
        const candidate = await resizeImage(originalFile, s)
        if (candidate.size <= maxSizeBytes) { finalBlob = candidate; break }
      }

      if (!finalBlob) {
        throw new Error('Image is too large even after resizing. Try a smaller image.')
      }

      const filePath = `${currentUser.id}/avatar.png`
      const fileToUpload = new File([finalBlob], `avatar.png`, { type: 'image/png' })

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, fileToUpload, { upsert: true, contentType: 'image/png' })

      if (uploadError) throw uploadError

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_updated: new Date().toISOString() }
      })
      
      if (updateError) throw updateError

      toast.success("Profile picture updated!", { id: toastId, description: "Looking good!" })
      router.refresh()
    } catch (error: any) {
      console.error(error)
      toast.error("Upload failed", { id: toastId, description: error?.message || "Could not upload image." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-xl font-bold text-slate-800">Profile & Security</h2>

      {/* Avatar Upload */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex items-center gap-6">
        <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center text-2xl font-bold text-slate-400 border-2 border-dashed border-slate-300 overflow-hidden relative">
          <img 
            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${currentUser.id}/avatar.png?t=${new Date().getTime()}`}
            onError={(e) => e.currentTarget.style.display = 'none'}
            className="absolute inset-0 w-full h-full object-cover"
            alt="Avatar"
          />
          <span>{currentUser.email?.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <h3 className="font-bold text-slate-800">Profile Picture</h3>
          <p className="text-sm text-slate-500 mb-3">Upload a new avatar. JPG or PNG.</p>
          <label className="cursor-pointer px-4 py-2 bg-white border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 transition">
            Upload New Picture
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleAvatarUpload}
              disabled={loading}
            />
          </label>
        </div>
      </div>
      
      {/* Password Change */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span>🔒</span> Change Password
        </h3>
        <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
            <input 
              type="password" required 
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              value={currentPass} onChange={e => setCurrentPass(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
            <input 
              type="password" required 
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              value={newPass} onChange={e => setNewPass(e.target.value)}
            />
            {newPass && (
              <div className="mt-2">
                <div className="flex gap-1 h-1.5 mb-1">
                  {[1,2,3,4,5].map(step => (
                    <div key={step} className={`flex-1 rounded-full transition-all duration-300 ${
                      getPasswordStrengthIndicator(newPass).strength >= step 
                        ? (getPasswordStrengthIndicator(newPass).strength < 3 ? 'bg-red-500' : 'bg-green-500') 
                        : 'bg-slate-200'
                    }`}></div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 text-right">
                  {getPasswordStrengthIndicator(newPass).strength < 3 ? 'Weak Password' : 'Strong Password'}
                </p>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
            <input 
              type="password" required 
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

      {/* 2FA Section */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
          Two-Factor Authentication
        </h3>
        
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
                <div className="flex gap-2">
                  <button onClick={handleCopyBackupCodes} className="text-xs bg-white border border-yellow-200 px-2 py-1 rounded hover:bg-yellow-100 transition">📋 Copy</button>
                  <button onClick={handleDownloadBackupCodes} className="text-xs bg-white border border-yellow-200 px-3 py-1.5 rounded hover:bg-yellow-100 transition">⬇️ Download</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {showCodes.map((c, idx) => (
                  <div key={idx} className="font-mono text-sm bg-white p-2 rounded border select-all">{c}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Active Devices */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <span>📱</span> Active Devices
          </h3>
          {sessions.length > 1 && !sessionsLoading && !sessionsError && (
            <button 
              onClick={handleSignOutAll}
              disabled={loading}
              className="text-xs font-bold text-red-600 border border-red-200 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 transition"
            >
              Sign Out All Devices
            </button>
          )}
        </div>

        <div className="space-y-3">
          {sessionsLoading && (
            <p className="text-sm text-slate-500 italic">Fetching device list...</p>
          )}
          {sessionsError && !sessionsLoading && (
            <p className="text-sm text-red-600">{sessionsError}</p>
          )}
          {!sessionsLoading && !sessionsError && sessions.length === 0 && (
            <p className="text-sm text-slate-500 italic">No active devices found.</p>
          )}
          
          {sessions.map((session) => {
            const { name, icon } = getDeviceInfo(session.user_agent)
            return (
              <div key={session.id} className={`flex items-center justify-between p-3 rounded border ${session.is_current ? 'border-green-200 bg-green-50' : 'border-slate-100 bg-slate-50'}`}>
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded flex items-center justify-center text-xl ${session.is_current ? 'bg-green-100 text-green-600' : 'bg-white border border-slate-200 text-slate-400'}`}>
                    {icon}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">
                      {name}
                      {session.is_current && <span className="ml-2 text-xs bg-green-200 text-green-800 px-1.5 py-0.5 rounded-full">Current Device</span>}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span>📍 {session.ip}</span>
                      <span>•</span>
                      <span>🕒 Last used: {new Date(session.last_active).toLocaleDateString()} {new Date(session.last_active).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>

                {!session.is_current && (
                  <button 
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={loading}
                    className="text-xs text-slate-500 hover:text-red-600 underline px-2"
                  >
                    Revoke
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
