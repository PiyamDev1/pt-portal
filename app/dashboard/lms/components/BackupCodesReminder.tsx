'use client'

import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface BackupCodesReminderProps {
  userId: string
  onDownloaded?: () => void
}

export function BackupCodesReminder({ userId, onDownloaded }: BackupCodesReminderProps) {
  const [hidden, setHidden] = useState(false)
  const [backupCodesDownloaded, setBackupCodesDownloaded] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkBackupCodeStatus = async () => {
      try {
        // Check localStorage first
        const dismissed = localStorage.getItem(`backup-reminder-dismissed-${userId}`)
        if (dismissed) {
          setHidden(true)
          setLoading(false)
          return
        }

        // Check if user has downloaded backup codes (via API call if needed)
        // For now, we'll use localStorage to track this
        const downloaded = localStorage.getItem(`backup-codes-downloaded-${userId}`)
        setBackupCodesDownloaded(!!downloaded)
        
        if (downloaded) {
          setHidden(true)
        }
      } finally {
        setLoading(false)
      }
    }

    checkBackupCodeStatus()
  }, [userId])

  const handleDismiss = () => {
    localStorage.setItem(`backup-reminder-dismissed-${userId}`, 'true')
    setHidden(true)
  }

  const handleDownload = () => {
    // Mark as downloaded
    localStorage.setItem(`backup-codes-downloaded-${userId}`, 'true')
    setBackupCodesDownloaded(true)
    setHidden(true)
    onDownloaded?.()
  }

  if (loading || hidden || backupCodesDownloaded) {
    return null
  }

  return (
    <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-4 rounded flex items-start gap-3 shadow-sm">
      <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="font-bold text-amber-900 mb-1">Save Your Backup Codes</h3>
        <p className="text-sm text-amber-800 mb-3">
          Backup codes are your only way to regain access to your account if you lose access to your authenticator app. 
          Download and store them in a safe place now.
        </p>
        <div className="flex gap-2">
          <a
            href="/dashboard/account"
            className="text-sm px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors font-medium"
          >
            Go to Account Settings
          </a>
          <button
            onClick={handleDismiss}
            className="text-sm px-3 py-1.5 bg-amber-200 text-amber-900 rounded hover:bg-amber-300 transition-colors font-medium"
          >
            Remind Later
          </button>
        </div>
      </div>
      <button
        onClick={handleDismiss}
        className="text-amber-500 hover:text-amber-700 transition-colors flex-shrink-0"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  )
}
