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

/**
 * Hook for monitoring connection status with automatic reconnection
 * Useful for showing connection fallback UI
 */
export function useMinioConnectionWithRetry(maxRetries: number = 3, baseDelay: number = 1000) {
  const { status, loading, error, checkStatus } = useMinioConnection(undefined, false)
  const [retryCount, setRetryCount] = useState(0)
  const [isRetrying, setIsRetrying] = useState(false)
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * Attempt to reconnect with exponential backoff
   */
  const attemptReconnect = useCallback(async () => {
    if (retryCount >= maxRetries) {
      setIsRetrying(false)
      return
    }

    setIsRetrying(true)

    // Exponential backoff: 1s, 2s, 4s, etc.
    const delay = baseDelay * Math.pow(2, retryCount)

    retryTimerRef.current = setTimeout(() => {
      checkStatus()
      setRetryCount((prev) => prev + 1)
    }, delay)
  }, [retryCount, maxRetries, baseDelay, checkStatus])

  /**
   * Reset retry counter
   */
  const resetRetries = useCallback(() => {
    setRetryCount(0)
    setIsRetrying(false)
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
    }
  }, [])

  /**
   * Auto-retry on error
   */
  useEffect(() => {
    if (error && !isRetrying && retryCount < maxRetries) {
      const retryTask = window.setTimeout(() => {
        void attemptReconnect()
      }, 0)

      return () => window.clearTimeout(retryTask)
    }
  }, [error, isRetrying, retryCount, maxRetries, attemptReconnect])

  /**
   * Reset retry count on success
   */
  useEffect(() => {
    if (status?.connected) {
      const resetTask = window.setTimeout(() => {
        resetRetries()
      }, 0)

      return () => window.clearTimeout(resetTask)
    }
  }, [status?.connected, resetRetries])

  /**
   * Cleanup
   */
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
    }
  }, [])

  return {
    // From base hook
    status,
    loading,
    error,
    connected: status?.connected ?? false,
    ping: status?.ping ?? null,
    checkStatus,

    // Retry management
    isRetrying,
    retryCount,
    maxRetries,
    attemptReconnect,
    resetRetries,
    canRetry: retryCount < maxRetries,
  }
}
