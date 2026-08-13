/**
 * My Account Page
 *
 * User account management interface with features:
 * - View and update user profile information
 * - Change password with verification
 * - Manage 2FA settings (enable/disable)
 * - View and regenerate backup codes
 * - Reset authentication credentials
 *
 * Client component that authenticates the user and manages account security settings.
 *
 * @module app/dashboard/account/page
 */
'use client'
import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import type { User } from '@supabase/supabase-js'
import { PasskeySettingsPanel } from './PasskeySettingsPanel'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import DashboardClientWrapper from '@/app/dashboard/client-wrapper'

export default function MyAccountPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  // Password States
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [confirmAction, setConfirmAction] = useState<'reset-2fa' | 'backup-codes' | null>(null)
  const [verificationCode, setVerificationCode] = useState('')

  useEffect(() => {
    async function getUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) setUser(user)
    }
    getUser()
  }, [supabase])

  // --- ACTION: CHANGE PASSWORD ---
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user?.email) {
      toast.error('User session not ready')
      return
    }
    if (newPass !== confirmPass) {
      toast.error('New passwords do not match')
      return
    }
    // Client-side strong validation to match server rules
    const errs: string[] = []
    if (newPass.length < 8) errs.push('at least 8 characters')
    if (!/[a-z]/.test(newPass)) errs.push('a lowercase letter')
    if (!/[A-Z]/.test(newPass)) errs.push('an uppercase letter')
    if (!/[0-9]/.test(newPass)) errs.push('a number')
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+\\/\[\];']/.test(newPass)) errs.push('a special character')
    if (errs.length) {
      toast.error('Password must contain: ' + errs.join(', '))
      return
    }

    setLoading(true)

    // The server reauthenticates the current password immediately before the change.
    const updateResponse = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }),
    })

    const updateResult = await updateResponse.json().catch(() => ({}))
    if (!updateResponse.ok) {
      toast.error('Failed to update password: ' + (updateResult.error || 'Unknown'))
    } else {
      toast.success('Password updated successfully!')
      setCurrentPass('')
      setNewPass('')
      setConfirmPass('')
    }
    setLoading(false)
  }

  // --- ACTION: RESET 2FA ---
  const handleReset2FA = async (confirmed = false) => {
    if (!user?.id) {
      toast.error('User session not ready')
      return
    }
    if (!confirmed) {
      setConfirmAction('reset-2fa')
      return
    }

    setLoading(true)

    const res = await fetch('/api/auth/reset-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verificationCode: verificationCode.trim(),
        verificationMethod: 'auto',
      }),
    })

    if (res.ok) {
      toast.success('2FA has been reset. Redirecting you to setup...')
      setTimeout(() => router.push('/login/setup-2fa'), 1500)
    } else {
      const data = await res.json()
      toast.error('Failed to reset 2FA: ' + (data?.error || 'Unknown'))
    }
    setVerificationCode('')
    setLoading(false)
  }

  // --- ACTION: GENERATE BACKUP CODES ---
  const [showCodes, setShowCodes] = useState<string[] | null>(null)
  const [backupCodeCount, setBackupCodeCount] = useState(0)

  useEffect(() => {
    if (!user) return
    const fetchBackupCodeCount = async () => {
      const res = await fetch('/api/auth/backup-codes/count')
      if (res.ok) {
        const data = await res.json()
        setBackupCodeCount(data.count || 0)
      }
    }
    fetchBackupCodeCount()
  }, [user])

  const handleGenerateBackupCodes = async (confirmed = false) => {
    if (!user?.id) {
      toast.error('User session not ready')
      return
    }
    if (!confirmed) {
      setConfirmAction('backup-codes')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/generate-backup-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        count: 10,
        verificationCode: verificationCode.trim(),
        verificationMethod: 'auto',
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowCodes(data.codes || [])
      setBackupCodeCount(10)
      await fetch('/api/auth/security-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backup_codes_downloaded: false }),
      })
      toast.success('Backup codes generated successfully')
    } else {
      toast.error('Failed to generate backup codes: ' + (data?.error || 'Unknown'))
    }
    setVerificationCode('')
    setLoading(false)
  }

  const handleConfirmAction = async () => {
    if (confirmAction === 'reset-2fa') {
      await handleReset2FA(true)
    }
    if (confirmAction === 'backup-codes') {
      await handleGenerateBackupCodes(true)
    }
    setConfirmAction(null)
  }

  const handleDownloadBackupCodes = () => {
    if (!showCodes) return
    const text =
      'Piyam Travels - Backup Codes\n' +
      'Save these codes in a secure location.\n' +
      'Each code can be used once for 2FA.\n\n' +
      showCodes.join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backup-codes.txt'
    a.click()

    void fetch('/api/auth/security-preferences', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup_codes_downloaded: true }),
    })
    toast.success('Backup codes downloaded successfully')
  }

  const handleCopyBackupCodes = async () => {
    if (!showCodes) return
    const text = showCodes.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Backup codes copied to clipboard!')
    } catch (err) {
      toast.error('Failed to copy codes')
    }
  }

  if (!user) {
    return (
      <DashboardClientWrapper>
        <div className="p-8" role="status" aria-live="polite">
          Loading account...
        </div>
      </DashboardClientWrapper>
    )
  }

  return (
    <DashboardClientWrapper>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <Link
          href="/dashboard"
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">My Account Settings</h1>

        {/* 1. PASSWORD SECTION */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <span>🔒</span> Change Password
          </h2>

          <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                value={currentPass}
                onChange={(e) => setCurrentPass(e.target.value)}
              />
            </div>
            <div className="pt-2 border-t border-slate-100"></div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                value={confirmPass}
                onChange={(e) => setConfirmPass(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-medium transition"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* 2. SECURITY & 2FA SECTION */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
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
                onClick={() => handleReset2FA()}
                disabled={loading}
                className="border border-red-200 text-red-600 bg-red-50 px-4 py-2 rounded hover:bg-red-100 font-medium transition text-sm"
              >
                Re-install 2FA Keys
              </button>
              <button
                onClick={() => handleGenerateBackupCodes()}
                disabled={loading}
                className="border border-slate-200 text-slate-700 bg-white px-4 py-2 rounded hover:bg-slate-50 font-medium transition text-sm"
              >
                Generate Backup Codes
              </button>
            </div>

            {!showCodes && backupCodeCount > 0 && (
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                <p>
                  <strong>Remaining backup codes:</strong> {backupCodeCount} unused
                </p>
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
                    <div
                      key={idx}
                      className="font-mono text-sm bg-white p-2 rounded border select-all"
                    >
                      {c}
                    </div>
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

        <PasskeySettingsPanel />
      </div>

      <ConfirmationDialog
        isOpen={!!confirmAction}
        onClose={() => {
          setConfirmAction(null)
          setVerificationCode('')
        }}
        onConfirm={handleConfirmAction}
        title={confirmAction === 'reset-2fa' ? 'Reset 2FA' : 'Generate Backup Codes'}
        message={
          confirmAction === 'reset-2fa'
            ? 'This will disable your current Authenticator codes and require setup again.'
            : 'Generate new backup codes? Previous codes will be invalidated.'
        }
        confirmLabel={confirmAction === 'reset-2fa' ? 'Reset 2FA' : 'Generate'}
        cancelLabel="Cancel"
        type={confirmAction === 'reset-2fa' ? 'danger' : 'warning'}
        isLoading={loading}
        confirmDisabled={!verificationCode.trim()}
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Authenticator or backup code
          </label>
          <input
            type="text"
            autoFocus
            autoComplete="one-time-code"
            value={verificationCode}
            onChange={(event) => setVerificationCode(event.target.value)}
            placeholder="Enter a current verification code"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <p className="mt-1 text-xs text-slate-500">
            A valid current code is required immediately before this security change.
          </p>
        </div>
      </ConfirmationDialog>
    </DashboardClientWrapper>
  )
}
