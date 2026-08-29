'use client'

import { useCallback, useEffect, useState } from 'react'
import { Activity, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'

type Payload = {
  settings: {
    enabled: boolean
    configured: boolean
    monthlyLimit: number
    weeklyIntervalDays: number
    predepartureHours: number
    maxChecksPerRun: number
    updatedAt: string
  }
  usage: { used: number; remaining: number; monthStartedAt: string }
  recent: Array<{
    id: string
    checkKind: string
    outcome: string
    units: number
    requestedAt: string
    httpStatus: number | null
    errorMessage: string | null
  }>
}

export function TicketingFlightApiTab() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [draft, setDraft] = useState<Payload['settings'] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/admin/ticketing/flight-api', { cache: 'no-store' })
      const data = (await response.json().catch(() => ({}))) as Payload & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to load flight API settings')
      setPayload(data)
      setDraft(data.settings)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load flight API settings')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!draft) return
    setIsSaving(true)
    try {
      const response = await fetch('/api/admin/ticketing/flight-api', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: draft.enabled,
          monthlyLimit: draft.monthlyLimit,
          weeklyIntervalDays: draft.weeklyIntervalDays,
          predepartureHours: draft.predepartureHours,
          maxChecksPerRun: draft.maxChecksPerRun,
        }),
      })
      const data = (await response.json().catch(() => ({}))) as Payload & { error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to save flight API settings')
      setPayload(data)
      setDraft(data.settings)
      toast.success('Ticketing flight API settings saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to save flight API settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading && !draft)
    return <p className="text-sm text-slate-500">Loading flight API settings…</p>
  if (!draft || !payload)
    return <p className="text-sm text-red-700">Flight API settings are unavailable.</p>

  const field = (
    key: 'monthlyLimit' | 'weeklyIntervalDays' | 'predepartureHours' | 'maxChecksPerRun',
    label: string,
    min: number,
    max: number,
  ) => (
    <label className="text-xs font-bold text-slate-700">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={draft[key]}
        onChange={(event) =>
          setDraft((current) =>
            current ? { ...current, [key]: Number(event.target.value) } : current,
          )
        }
        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
      />
    </label>
  )

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Ticketing integration
            </p>
            <h1 className="mt-1 text-xl font-black text-slate-950">AeroDataBox monitoring</h1>
            <p className="mt-1 text-sm text-slate-600">
              Check each future sector weekly, then once more by the pre-departure deadline. The
              daily scheduler starts that final check during the preceding 24 hours. API keys stay
              in server environment variables.
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-black ${draft.configured ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}
          >
            {draft.configured ? 'API key configured' : 'API key missing'}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {field('monthlyLimit', 'Monthly call limit', 1, 1_000_000)}
          {field('weeklyIntervalDays', 'Weekly interval (days)', 1, 31)}
          {field('predepartureHours', 'Final check deadline (hours before)', 24, 168)}
          {field('maxChecksPerRun', 'Maximum checks per daily run', 1, 100)}
        </div>

        <label className="mt-4 flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={!draft.configured}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, enabled: event.target.checked } : current,
              )
            }
            className="h-5 w-5 rounded border-slate-300 text-[#8b1e2d]"
          />
          <span>
            <span className="block text-sm font-black text-slate-900">
              Enable automatic schedule checks
            </span>
            <span className="block text-xs text-slate-500">
              The daily Vercel cron selects only sectors that are due.
            </span>
          </span>
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#8b1e2d] px-4 text-sm font-black text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {isSaving ? 'Saving…' : 'Save settings'}
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={isLoading}
            className="ui-tap ui-focus inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
          <p className="text-xs font-bold text-sky-700">Used this month</p>
          <p className="mt-1 text-2xl font-black text-sky-950">{payload.usage.used}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-bold text-emerald-700">Remaining</p>
          <p className="mt-1 text-2xl font-black text-emerald-950">{payload.usage.remaining}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-bold text-slate-500">Monthly limit</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{payload.settings.monthlyLimit}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="inline-flex items-center gap-2 text-lg font-black text-slate-950">
          <Activity className="h-5 w-5 text-[#8b1e2d]" /> Recent API calls
        </h2>
        <div className="mt-3 divide-y divide-slate-100">
          {payload.recent.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">No API calls recorded this month.</p>
          ) : (
            payload.recent.map((call) => (
              <div
                key={call.id}
                className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-bold text-slate-800">
                    {call.checkKind} · {call.outcome}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(call.requestedAt).toLocaleString('en-GB', {
                      timeZone: 'Europe/London',
                    })}
                  </p>
                </div>
                <p className="text-xs font-semibold text-slate-500">
                  {call.units} call{call.units === 1 ? '' : 's'}
                  {call.httpStatus ? ` · HTTP ${call.httpStatus}` : ''}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
