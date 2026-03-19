/**
 * Progress Bar Provider
 * Wraps route transitions with a lightweight top loading indicator.
 */
'use client'

import { Suspense } from 'react'
import { AppProgressBar as ProgressBar } from 'next-nprogress-bar'

export function ProgressBarProvider() {
  return (
    <Suspense fallback={null}>
      <ProgressBar height="3px" color="#1e293b" options={{ showSpinner: false }} shallowRouting />
    </Suspense>
  )
}
