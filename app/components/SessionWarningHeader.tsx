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

  const percentage = (secondsRemaining / 30) * 100

  return (
    <div className="fixed top-16 left-0 right-0 z-40 pointer-events-none flex justify-center px-4 py-4">
      <div className="relative bg-white border-2 border-red-300 rounded-lg shadow-lg max-w-md w-full pointer-events-auto">
        {/* Progress bar background */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 rounded-t-md overflow-hidden">
          <div 
            className="h-full bg-red-500 transition-all duration-1000 ease-linear"
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        <div className="p-4 pt-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 102 0V6z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">Session ending soon</p>
                <p className="text-xs text-slate-600">Move your mouse or press a key to stay logged in</p>
              </div>
            </div>
            <div className="text-3xl font-bold text-red-600 tabular-nums min-w-12 text-right">
              {secondsRemaining}s
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
