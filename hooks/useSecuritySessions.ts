/**
 * Security Sessions Hook
 * Manages active device sessions and backup code count for account security
 * Fetches device information from backend and provides methods to manage sessions
 * 
 * @module hooks/useSecuritySessions
 */

import { useEffect, useState } from 'react'
import type { DeviceSession } from '@/app/types/auth'

interface UseSecuritySessionsParams {
  /** Current user's ID */
  userId: string
}

/**
 * Hook to load and manage user's security sessions
 * @param params Parameters object with userId
 * @returns Object with sessions state, loading, error, and backup code count
 */
export function useSecuritySessions({ userId }: UseSecuritySessionsParams) {
  const [sessions, setSessions] = useState<DeviceSession[]>([])
  const [sessionsError, setSessionsError] = useState<string | null>(null)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [backupCodeCount, setBackupCodeCount] = useState(0)

  useEffect(() => {
    let isActive = true

    fetch(`/api/auth/backup-codes/count?userId=${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (isActive) {
          setBackupCodeCount(data.count || 0)
        }
      })
      .catch(() => {})

    Promise.resolve().then(() => {
      if (!isActive) return
      setSessionsLoading(true)
      setSessionsError(null)
    })

    fetch('/api/auth/sessions', { credentials: 'include' })
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to fetch sessions')
        }
        if (!isActive) return
        if (data.sessions) setSessions(data.sessions)
        else setSessions([])
      })
      .catch((err) => {
        if (!isActive) return
        console.error('[useSecuritySessions] Error loading sessions:', err)
        setSessionsError('Unable to load devices. Please try refreshing.')
      })
      .finally(() => {
        if (isActive) {
          setSessionsLoading(false)
        }
      })

    return () => {
      isActive = false
    }
  }, [userId])

  return {
    sessions,
    setSessions,
    sessionsError,
    sessionsLoading,
    backupCodeCount,
    setBackupCodeCount,
  }
}
