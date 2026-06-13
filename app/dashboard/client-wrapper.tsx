/**
 * Dashboard Client Wrapper
 *
 * Provides shared client-side dashboard behaviour. Navigation now lives in the mobile
 * hamburger header so every dashboard page has one consistent menu surface.
 */
'use client'

import { useState } from 'react'
// import { useSessionTimeout } from '@/hooks/useSessionTimeout'
import { SessionWarningHeader } from '@/app/components/SessionWarningHeader'
import { PasskeySetupPrompt } from '@/app/components/PasskeySetupPrompt'

export default function DashboardClientWrapper({ children }: { children: React.ReactNode }) {
  const [showWarning, setShowWarning] = useState(false)
  const [secondsRemaining, setSecondsRemaining] = useState(0)

  // Session timeout temporarily disabled
  // useSessionTimeout((warning, seconds) => {
  //   setShowWarning(warning)
  //   setSecondsRemaining(seconds || 0)
  // })

  return (
    <div className="dashboard-mobile-shell">
      <SessionWarningHeader showWarning={showWarning} secondsRemaining={secondsRemaining} />
      {children}
      <PasskeySetupPrompt />
    </div>
  )
}
