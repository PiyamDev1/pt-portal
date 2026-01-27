'use client'

import { Suspense } from 'react'
import { AppProgressBar as ProgressBar } from 'next-nprogress-bar'

export function ProgressBarProvider() {
  return (
    <Suspense fallback={null}>
      <ProgressBar
        height="3px"
        color="#1e293b"
        options={{ showSpinner: false }}
        shallowRouting
      />
    </Suspense>
  )
}
