'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

const INACTIVITY_TIMEOUT = 5 * 60 * 1000 // 5 minutes in milliseconds

export function useSessionTimeout() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null

    const resetTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId)
      
      timeoutId = setTimeout(async () => {
        await supabase.auth.signOut()
        router.push('/login')
      }, INACTIVITY_TIMEOUT)
    }

    // Track user activity
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click']
    
    events.forEach(event => {
      window.addEventListener(event, resetTimeout)
    })

    // Initialize the timeout
    resetTimeout()

    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      events.forEach(event => {
        window.removeEventListener(event, resetTimeout)
      })
    }
  }, [router, supabase])
}
