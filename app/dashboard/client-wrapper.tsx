'use client'
import { useState } from 'react'
import { useSessionTimeout } from '@/app/hooks/useSessionTimeout'
import { SessionWarningHeader } from '@/app/components/SessionWarningHeader'

export default function DashboardClientWrapper({ children }: { children: React.ReactNode }) {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(0)

  useSessionTimeout((warning, seconds) => {
    setShowWarning(warning)
    setSecondsRemaining(seconds || 0)
  })

  return (
    <>
      <SessionWarningHeader showWarning={showWarning} secondsRemaining={secondsRemaining} />
      {children}
    </>
  )
}
