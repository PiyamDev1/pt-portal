'use client'
import { useEffect, useState } from 'react'

interface SessionWarningHeaderProps {
  showWarning: boolean
  secondsRemaining: number
}

export function SessionWarningHeader({ showWarning, secondsRemaining }: SessionWarningHeaderProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !showWarning) {
    return null
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white px-4 py-3 shadow-lg animate-pulse">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          <span className="font-semibold text-sm sm:text-base">Session Timeout Warning</span>
        </div>
        <div className="text-xs sm:text-sm font-medium whitespace-nowrap">
          You will be logged out in{' '}
          <span className="font-bold text-lg tabular-nums bg-red-700 px-2 py-1 rounded">
            {secondsRemaining}s
          </span>
        </div>
        <p className="hidden sm:block text-xs flex-grow">Stay active to continue your session</p>
      </div>
    </div>
  )
}
