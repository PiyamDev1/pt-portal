/**
 * Session Timeout Hook
 * Monitors user inactivity and logs out after timeout period
 * Shows warning with countdown before automatic logout
 * 
 * @module hooks/useSessionTimeout
 */

'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

/** Time before session expires (milliseconds) */
const INACTIVITY_TIMEOUT = 5 * 60 * 1000 // 5 minutes
/** Time to show warning before logout */
const WARNING_TIME = 30 * 1000 // 30 seconds

/**
 * Hook to handle automatic session timeout after inactivity
 * @param onWarningChange Optional callback when warning state changes
 * @returns Hook for using in components
 */
export function useSessionTimeout(
  onWarningChange?: (showWarning: boolean, secondsRemaining?: number) => void,
) {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const [showWarning, setShowWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(0)

  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }, [supabase, router])

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null
    let warningTimeoutId: NodeJS.Timeout | null = null
    let countdownIntervalId: NodeJS.Timeout | null = null

    const resetTimeout = () => {
      // Clear all existing timeouts and intervals
      if (timeoutId) clearTimeout(timeoutId)
      if (warningTimeoutId) clearTimeout(warningTimeoutId)
      if (countdownIntervalId) clearInterval(countdownIntervalId)

      setShowWarning(false)
      setSecondsRemaining(0)
      onWarningChange?.(false, 0)

      // Set warning timeout (fires 30 seconds before logout)
      warningTimeoutId = setTimeout(() => {
        setShowWarning(true)
        onWarningChange?.(true, 30)
        setSecondsRemaining(30)

        // Start countdown
        let countdown = 30
        countdownIntervalId = setInterval(() => {
          countdown -= 1
          setSecondsRemaining(countdown)
          onWarningChange?.(true, countdown)

          if (countdown <= 0) {
            if (countdownIntervalId) clearInterval(countdownIntervalId)
          }
        }, 1000)
      }, INACTIVITY_TIMEOUT - WARNING_TIME)

      // Set logout timeout
      timeoutId = setTimeout(handleLogout, INACTIVITY_TIMEOUT)
    }

    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']

    const eventHandler = () => {
      // Only reset if warning is not showing (user can stay active during warning without resetting)
      if (!showWarning) {
        resetTimeout()
      }
    }

    events.forEach((event) => {
      window.addEventListener(event, eventHandler)
    })

    // Initialize the timeout
    resetTimeout()

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      if (warningTimeoutId) clearTimeout(warningTimeoutId)
      if (countdownIntervalId) clearInterval(countdownIntervalId)
      events.forEach((event) => {
        window.removeEventListener(event, eventHandler)
      })
    }
  }, [router, supabase, handleLogout, showWarning, onWarningChange])

  return { showWarning, secondsRemaining }
}
