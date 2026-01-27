'use client'

import { AppProgressBar as ProgressBar } from 'next-nprogress-bar'

export function ProgressBarProvider() {
  return (
    <ProgressBar
      height="3px"
      color="#1e293b"
      options={{ showSpinner: false }}
      shallowRouting
    />
  )
}
