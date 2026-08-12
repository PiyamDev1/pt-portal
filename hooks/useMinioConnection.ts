/**
 * Hook for managing MinIO connection status
 * Provides real-time connection status with automatic polling
 *
 * @module hooks/useMinioConnection
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { MinioStatus } from '@/app/dashboard/applications/nadra/components/DocumentHub/types'
import { documentClient } from '@/lib/services/documentClient'

const DEFAULT_POLL_INTERVAL = 300000 // 5 minutes - Conservative polling to avoid Vercel API limits

/**
 * Hook for managing MinIO connection status
 *
 * @param pollInterval - Interval in ms to check status (default: 5 mins)
 * @param autoStart - Whether to start polling on mount (default: true)
 *
 * @returns Object with status, loading, error flags and control methods
 */
export function useMinioConnection(
  pollInterval: number = DEFAULT_POLL_INTERVAL,
  autoStart: boolean = true,
) {
  const [status, setStatus] = useState<MinioStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef(true)

  /**
   * Check MinIO connection status
   * This can be called manually or automatically via polling
   */
  const checkStatus = useCallback(async () => {
    if (!isMountedRef.current) return

    setLoading(true)
    setError(null)

    try {
      const minioStatus = await documentClient.checkMinioStatus()

      if (isMountedRef.current) {
        setStatus(minioStatus)
        setError(minioStatus.error || null)
      }
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to check MinIO status'
        setError(errorMessage)
        setStatus(null)
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  /**
   * Start automatic polling
   */
  const startPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
    }

    // Check immediately
    checkStatus()

    // Then poll at interval
    pollTimerRef.current = setInterval(() => {
      checkStatus()
    }, pollInterval)
  }, [checkStatus, pollInterval])

  /**
   * Stop automatic polling
   */
  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  /**
   * Refresh status immediately and restart polling
   */
  const refresh = useCallback(async () => {
    stopPolling()
    await checkStatus()
    startPolling()
  }, [checkStatus, stopPolling, startPolling])

  /**
   * Setup polling on mount and cleanup on unmount
   */
  useEffect(() => {
    isMountedRef.current = true

    if (autoStart) {
      startPolling()
    }

    return () => {
      isMountedRef.current = false
      stopPolling()
    }
  }, [autoStart, startPolling, stopPolling])

  return {
    // State
    status,
    loading,
    error,
    connected: status?.connected ?? false,
    ping: status?.ping ?? null,

    // Methods
    checkStatus,
    startPolling,
    stopPolling,
    refresh,
  }
}
