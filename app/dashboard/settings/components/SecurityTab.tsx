'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { resizeImage, getPasswordStrengthIndicator } from './utils'
import { AvatarCard } from './AvatarCard'
import { PasswordChangeForm } from './PasswordChangeForm'
import { TwoFactorSection } from './TwoFactorSection'
import { ActiveDevicesSection } from './ActiveDevicesSection'
import { useSecuritySessions } from '@/app/hooks/useSecuritySessions'

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
  const {
    sessions,
    setSessions,
    sessionsError,
    sessionsLoading,
    backupCodeCount,
    setBackupCodeCount
  } = useSecuritySessions({ userId: currentUser.id })

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

      <AvatarCard currentUser={currentUser} loading={loading} onUpload={handleAvatarUpload} />

      <PasswordChangeForm
        loading={loading}
        currentPass={currentPass}
        newPass={newPass}
        confirmPass={confirmPass}
        onCurrentPassChange={setCurrentPass}
        onNewPassChange={setNewPass}
        onConfirmPassChange={setConfirmPass}
        onSubmit={handlePasswordChange}
      />

      <TwoFactorSection
        loading={loading}
        showCodes={showCodes}
        backupCodeCount={backupCodeCount}
        onReset2FA={handleReset2FA}
        onGenerateCodes={handleGenerateBackupCodes}
        onCopyCodes={handleCopyBackupCodes}
        onDownloadCodes={handleDownloadBackupCodes}
      />

      <ActiveDevicesSection
        sessions={sessions}
        loading={loading}
        sessionsLoading={sessionsLoading}
        sessionsError={sessionsError}
        onSignOutAll={handleSignOutAll}
        onRevokeSession={handleRevokeSession}
      />    </div>
  )
}
