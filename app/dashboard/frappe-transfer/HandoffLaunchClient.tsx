/**
 * IMS-to-Frappe handoff transition screen.
 */

'use client'

import { useEffect } from 'react'
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'

type FrappeHandoffLaunchClientProps = {
  employeeName?: string | null
}

export function FrappeHandoffLaunchClient({ employeeName }: FrappeHandoffLaunchClientProps) {
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.location.replace('/api/integrations/frappe/handoff')
    }, 650)

    return () => window.clearTimeout(timeout)
  }, [])

  return (
    <div className="mx-auto flex min-h-[520px] max-w-3xl items-center justify-center px-4 py-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-emerald-200 bg-white p-8 shadow-xl shadow-emerald-950/10">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-100 blur-2xl" />
        <div className="absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-sky-100 blur-2xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            IMS verified access
          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Opening Frappe HRMS
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            {employeeName ? `${employeeName}, your` : 'Your'} IMS account is linked. We are creating
            a short-lived secure handoff and opening your HRMS workspace.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                IMS session
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Confirmed</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Handoff
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Signing token</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ArrowRight className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Frappe
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Launching</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/api/integrations/frappe/handoff"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
            >
              Open now
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
