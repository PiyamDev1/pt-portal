/**
 * Root Error Boundary
 * Final client-side fallback UI for unhandled rendering/runtime errors.
 */
'use client'

import { useEffect } from 'react'

export function RootErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f3f4] px-4 py-10">
      <section className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-red-100 bg-white p-7 text-center shadow-2xl shadow-red-950/10 sm:p-10">
        <div className="portal-error-orbit mx-auto" aria-hidden="true">
          <span className="portal-error-orbit__ring" />
          <img src="/logo.png" alt="" className="portal-error-orbit__logo" />
          <span className="portal-error-orbit__dot" />
        </div>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.2em] text-[#7f1d2d]">
          A small detour
        </p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Something went wrong</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">
          Your work is still safe. Try loading this section again or return to the dashboard.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-slate-500">Error ID: {error.digest}</p>
        ) : null}
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="min-h-11 rounded-full bg-[#7f1d2d] px-6 font-bold text-white hover:bg-[#651724]"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 px-6 font-bold text-slate-800"
          >
            Dashboard
          </a>
        </div>
      </section>
    </main>
  )
}
