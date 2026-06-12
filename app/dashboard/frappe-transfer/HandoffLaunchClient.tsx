/**
 * IMS-to-Frappe handoff transition screen.
 */

'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'
import { isMobileDevice, isStandalonePwa } from '@/lib/auth/webauthnClient'

type FrappeHandoffLaunchClientProps = {
  employeeName?: string | null
  returningFromFrappe?: boolean
}

type LaunchState = 'preparing' | 'ready' | 'failed'

type HandoffResponse = {
  url?: string
  redirect?: string
  error?: string
}

function buildHandoffEndpoint(format: 'redirect' | 'json') {
  const endpoint = new URL('/api/integrations/frappe/handoff', window.location.origin)
  const current = new URL(window.location.href)
  const target = current.searchParams.get('target') || '/hrms'
  endpoint.searchParams.set('target', target)
  if (format === 'json') endpoint.searchParams.set('format', 'json')
  return endpoint.toString()
}

export function FrappeHandoffLaunchClient({
  employeeName,
  returningFromFrappe = false,
}: FrappeHandoffLaunchClientProps) {
  const [handoffUrl, setHandoffUrl] = useState<string | null>(null)
  const [launchState, setLaunchState] = useState<LaunchState>('preparing')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mobileMode, setMobileMode] = useState(false)

  useEffect(() => {
    const shouldOpenExternally = isMobileDevice() || isStandalonePwa()
    setMobileMode(shouldOpenExternally)

    if (!shouldOpenExternally) {
      const timeout = window.setTimeout(() => {
        window.location.replace(buildHandoffEndpoint('redirect'))
      }, 650)

      return () => window.clearTimeout(timeout)
    }

    let cancelled = false

    const prepareMobileHandoff = async () => {
      try {
        const response = await fetch(buildHandoffEndpoint('json'), { cache: 'no-store' })
        const data = await response.json().catch(() => ({})) as HandoffResponse

        if (data.redirect && !response.ok) {
          window.location.assign(data.redirect)
          return
        }
        if (!response.ok || !data.url) {
          throw new Error(data.error || 'Unable to prepare Frappe handoff')
        }

        const url = data.url
        if (cancelled) return
        setHandoffUrl(url)
        setLaunchState('ready')
      } catch (error: unknown) {
        if (cancelled) return
        setErrorMessage(error instanceof Error ? error.message : 'Unable to open Frappe HRMS')
        setLaunchState('failed')
      }
    }

    void prepareMobileHandoff()

    return () => {
      cancelled = true
    }
  }, [])

  const stateLabel = {
    preparing: 'Preparing secure link',
    ready: returningFromFrappe ? 'IMS approval ready' : 'HRMS app link ready',
    failed: 'Handoff needs attention',
  }[launchState]

  const stateMessage = mobileMode
    ? returningFromFrappe
      ? 'Frio asked IMS to approve access. We are signing you back into the HRMS companion app now.'
      : 'For the smoothest phone experience, install the HRMS companion app when Frio opens. Future HRMS launches will still be approved by IMS first.'
    : 'We are creating a short-lived secure handoff and opening your HRMS workspace.'

  return (
    <div className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-3xl items-center justify-center px-2 py-6 sm:min-h-[520px] sm:px-4 sm:py-10">
      <section className="relative w-full overflow-hidden rounded-[2rem] border border-emerald-200 bg-white p-5 shadow-xl shadow-emerald-950/10 sm:p-8">
        <div className="absolute -right-20 -top-20 h-52 w-52 rounded-full bg-emerald-100 blur-2xl" />
        <div className="absolute -bottom-24 -left-16 h-60 w-60 rounded-full bg-sky-100 blur-2xl" />
        <div className="absolute left-1/2 top-10 h-24 w-24 -translate-x-1/2 rounded-full bg-red-100 blur-3xl" />

        <div className="relative">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            IMS verified access
          </div>

          <div className="mt-6 flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-slate-950 text-white shadow-lg shadow-slate-950/20">
              {mobileMode ? (
                <Smartphone className="h-8 w-8" />
              ) : (
                <ExternalLink className="h-8 w-8" />
              )}
            </div>
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-700">
                {stateLabel}
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Opening Frappe HRMS
              </h1>
            </div>
          </div>

          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            {employeeName ? `${employeeName}, your` : 'Your'} IMS account is linked. {stateMessage}
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
              {launchState === 'failed' ? (
                <ExternalLink className="h-5 w-5 text-red-600" />
              ) : launchState === 'ready' ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
              )}
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                Handoff
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {launchState === 'failed'
                  ? 'Failed'
                  : launchState === 'ready'
                    ? 'Ready'
                    : 'Signing token'}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ExternalLink className="h-5 w-5 text-emerald-600" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                HRMS app
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">
                {mobileMode ? 'Tap to open' : 'Launching'}
              </p>
            </div>
          </div>

          {errorMessage && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
              {errorMessage}
            </div>
          )}

          {mobileMode && launchState === 'preparing' && (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-4 text-sm text-white">
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-emerald-400" />
              </div>
              <p className="mt-3 font-bold">Preparing your secure HRMS launch...</p>
              <p className="mt-1 text-white/70">
                Keeping you on this IMS screen until the Frio handoff link is ready avoids the
                blank external browser screen during token creation.
              </p>
            </div>
          )}

          {mobileMode && !returningFromFrappe && (
            <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
              <p className="font-bold">Companion app setup</p>
              <p className="mt-1">
                Install HRMS once from the Frio screen. Direct Frio logins stay blocked; opening
                HRMS later will bounce through IMS for approval and return you to Frio.
              </p>
              <div className="mt-3 grid gap-2 rounded-xl bg-white/70 p-3 text-xs text-sky-950">
                <p>
                  <span className="font-bold">Android:</span> after HRMS opens, use the browser menu
                  or install banner to add the Frio HRMS app.
                </p>
                <p>
                  <span className="font-bold">iPhone:</span> open HRMS in Safari, tap Share, then
                  Add to Home Screen.
                </p>
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            {mobileMode ? (
              <a
                href={handoffUrl || undefined}
                onClick={(event) => {
                  if (!handoffUrl) event.preventDefault()
                }}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition ${
                  handoffUrl
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'pointer-events-none bg-emerald-600 opacity-60'
                }`}
              >
                Open HRMS App
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : (
              <a
                href="/api/integrations/frappe/handoff?target=/hrms"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700"
              >
                Open now
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
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
