import { useEffect, useState } from 'react'
import type { DeviceSession } from '@/app/types/auth'

interface UseSecuritySessionsParams {
  userId: string
}

export function useSecuritySessions({ userId }: UseSecuritySessionsParams) {
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [backupCodeCount, setBackupCodeCount] = useState(0)

  useEffect(() => {
    fetch(`/api/auth/backup-codes/count?userId=${userId}`)
      .then(res => res.json())
      .then(data => setBackupCodeCount(data.count || 0))
      .catch(() => {})

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
        console.error('[useSecuritySessions] Error loading sessions:', err)
        setSessionsError('Unable to load devices. Please try refreshing.')
      })
      .finally(() => setSessionsLoading(false))
  }, [userId])

  return {
    sessions,
    setSessions,
    sessionsError,
    sessionsLoading,
    backupCodeCount,
    setBackupCodeCount
  }
}
