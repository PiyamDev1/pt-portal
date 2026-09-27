/**
 * Timeclock History Client
 * Loads and displays historical punch activity with filters,
 * status context, and chronological attendance visibility.
 */
'use client'

import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  RefreshCw,
  Sparkles,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

type TimeclockEvent = {
  id: string
  employee_id?: string
  event_type: string
  punch_type?: string
  device_ts: string
  scanned_at: string
  adjusted_device_ts?: string | null
  adjusted_scanned_at?: string | null
  adjusted_at?: string | null
  adjustment_reason?: string | null
  geo?: { lat?: number; lng?: number; accuracy?: number } | null
  timeclock_devices?: { name?: string } | { name?: string }[] | null
}

type EventsResponse = {
  events: TimeclockEvent[]
  total: number
  page?: number
  pageSize?: number
  error?: string
}

type PunchKind = 'in' | 'out' | 'unknown'

const number = new Intl.NumberFormat('en-GB')

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const toLocalDateInput = (date: Date) => {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

const extractDeviceName = (device?: TimeclockEvent['timeclock_devices']) => {
  if (!device) return 'Unknown device'
  return Array.isArray(device)
    ? device[0]?.name || 'Unknown device'
    : device?.name || 'Unknown device'
}

const getEffectiveDeviceTime = (event: TimeclockEvent) =>
  event.adjusted_device_ts || event.device_ts
const getEffectiveRecordedTime = (event: TimeclockEvent) =>
  event.adjusted_scanned_at || event.scanned_at

function punchKind(event: Pick<TimeclockEvent, 'punch_type' | 'event_type'>): PunchKind {
  const value = (event.punch_type || event.event_type || '').trim().toUpperCase()
  if (['IN', 'CLOCK_IN', 'PUNCH_IN'].includes(value)) return 'in'
  if (['OUT', 'CLOCK_OUT', 'PUNCH_OUT'].includes(value)) return 'out'
  return 'unknown'
}

function formatDuration(minutes: number) {
  const rounded = Math.max(0, Math.round(minutes))
  return `${Math.floor(rounded / 60)}h ${String(rounded % 60).padStart(2, '0')}m`
}

function visibleSummary(events: TimeclockEvent[]) {
  const ordered = [...events]
    .map((event) => ({ event, at: new Date(getEffectiveRecordedTime(event)) }))
    .filter(({ at }) => !Number.isNaN(at.getTime()))
    .sort((left, right) => left.at.getTime() - right.at.getTime())

  let openAt: Date | null = null
  let workedMinutes = 0
  let completed = 0
  let incomplete = 0

  for (const item of ordered) {
    const kind = punchKind(item.event)
    if (kind === 'in') {
      if (openAt) incomplete += 1
      openAt = item.at
      continue
    }
    if (kind !== 'out') continue
    if (!openAt) {
      incomplete += 1
      continue
    }
    const minutes = (item.at.getTime() - openAt.getTime()) / 60_000
    if (minutes > 0 && minutes <= 20 * 60) {
      workedMinutes += minutes
      completed += 1
    } else {
      incomplete += 1
    }
    openAt = null
  }

  if (openAt) incomplete += 1

  return {
    workedMinutes,
    completed,
    incomplete,
    adjusted: events.filter((event) => Boolean(event.adjusted_at)).length,
  }
}

export default function TimeclockHistoryClient() {
  const [events, setEvents] = useState<TimeclockEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)

  const loadEvents = useCallback(
    async (nextPage = page) => {
      setLoading(true)
      setError('')
      try {
        const params = new URLSearchParams({
          scope: 'self',
          page: `${nextPage}`,
          pageSize: `${pageSize}`,
        })

        if (dateFrom) params.set('from', new Date(`${dateFrom}T00:00:00`).toISOString())
        if (dateTo) params.set('to', new Date(`${dateTo}T23:59:59.999`).toISOString())

        const response = await fetch(`/api/timeclock/events?${params.toString()}`)
        const data: EventsResponse = await response.json()
        if (!response.ok) {
          setError(data?.error || 'Unable to load events.')
          return
        }
        setEvents(data.events || [])
        setTotal(data.total || 0)
        setPage(data.page || nextPage)
        setPageSize(data.pageSize || pageSize)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unable to load events.')
      } finally {
        setLoading(false)
      }
    },
    [dateFrom, dateTo, page, pageSize],
  )

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const applyPreset = (preset: 'today' | 'last7' | 'last30' | 'clear') => {
    setPage(1)
    if (preset === 'clear') {
      setDateFrom('')
      setDateTo('')
      return
    }

    const today = new Date()
    const end = toLocalDateInput(today)
    if (preset === 'today') {
      setDateFrom(end)
      setDateTo(end)
      return
    }

    const days = preset === 'last7' ? 6 : 29
    const startDate = new Date(today)
    startDate.setDate(today.getDate() - days)
    setDateFrom(toLocalDateInput(startDate))
    setDateTo(end)
  }

  const summary = useMemo(() => visibleSummary(events), [events])
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-5">
      <section className="animate-enter-fade-up relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#7b1926] to-[#252830] px-5 py-6 text-white shadow-xl shadow-red-950/15 sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-red-300/20 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-red-100">
              <Clock3 className="h-4 w-4" />
              <p className="text-xs font-black uppercase tracking-[0.2em]">Time-clock history</p>
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">My punches</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-red-50/80">
              Review the timestamps that feed your attendance and performance record. Adjusted
              punches remain clearly marked and original values stay available for audit.
            </p>
          </div>
          <Link
            href="/dashboard/my-performance?view=attendance"
            className="ui-tap inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-black text-white backdrop-blur hover:bg-white/20"
          >
            Open My Performance <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Punch summary">
        <article className="animate-enter-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Punches in range
            </p>
            <CalendarDays className="h-4 w-4 text-[#8b1e2d]" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-950">{number.format(total)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {number.format(events.length)} visible on this page
          </p>
        </article>
        <article className="animate-enter-fade-up animate-enter-delay-1 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Recorded hours
            </p>
            <Clock3 className="h-4 w-4 text-blue-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {formatDuration(summary.workedMinutes)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Completed pairs visible on this page</p>
        </article>
        <article className="animate-enter-fade-up animate-enter-delay-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Complete sessions
            </p>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {number.format(summary.completed)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Valid IN-to-OUT pairs</p>
        </article>
        <article className="animate-enter-fade-up animate-enter-delay-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
              Needs attention
            </p>
            <AlertCircle className="h-4 w-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {number.format(summary.incomplete)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.adjusted > 0
              ? `${summary.adjusted} adjusted punch${summary.adjusted === 1 ? '' : 'es'}`
              : 'No unmatched pairs visible'}
          </p>
        </article>
      </section>

      <section className="animate-enter-fade-up animate-enter-delay-1 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Filter history
            </p>
            <h3 className="mt-1 text-xl font-black text-slate-950">Find a punch quickly</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Choose a range, then inspect device time, recorded time, and location.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['today', 'Today'],
                ['last7', 'Last 7 days'],
                ['last30', 'Last 30 days'],
                ['clear', 'Clear'],
              ] as const
            ).map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyPreset(preset)}
                className="ui-tap rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-[#8b1e2d]"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs font-black text-slate-600">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => {
                setPage(1)
                setDateFrom(event.target.value)
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </label>
          <label className="text-xs font-black text-slate-600">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(event) => {
                setPage(1)
                setDateTo(event.target.value)
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </label>
          <button
            type="button"
            onClick={() => loadEvents(1)}
            disabled={loading}
            className="ui-tap inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-xs font-black text-white shadow-sm hover:bg-[#6f1422] disabled:cursor-wait disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Apply filters
          </button>
        </div>
      </section>

      <section className="animate-enter-fade-up animate-enter-delay-2 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Evidence trail
            </p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Recent punches</h3>
          </div>
          <p className="text-xs font-bold text-slate-400">
            Times shown in your local browser timezone
          </p>
        </div>

        <div className="p-5 sm:p-6">
          {loading && (
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin text-[#8b1e2d]" /> Loading your punches…
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => loadEvents(page)}
                className="ui-tap inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#8b1e2d]"
              >
                Try again <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {!loading && !error && events.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-slate-300" />
              <p className="mt-3 text-sm font-black text-slate-700">No punches in this range</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Try a wider date range or use Today after your next clock-in.
              </p>
            </div>
          )}

          {!loading && !error && events.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-slate-100">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Punch</th>
                    <th className="px-4 py-3">Device time</th>
                    <th className="px-4 py-3">Recorded</th>
                    <th className="px-4 py-3">Location</th>
                  </tr>
                </thead>
                <tbody className="text-slate-700">
                  {events.map((event, index) => {
                    const geo = event.geo
                    const hasLocation = typeof geo?.lat === 'number' && typeof geo?.lng === 'number'
                    const kind = punchKind(event)
                    return (
                      <tr
                        key={event.id}
                        className="animate-enter-fade-up border-t border-slate-100 transition hover:bg-red-50/40"
                        style={{ animationDelay: `${Math.min(index * 35, 240)}ms` }}
                      >
                        <td className="whitespace-nowrap px-4 py-3.5 font-bold text-slate-800">
                          {extractDeviceName(event.timeclock_devices)}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-black ${
                              kind === 'in'
                                ? 'bg-emerald-100 text-emerald-800'
                                : kind === 'out'
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {event.punch_type || event.event_type}
                          </span>
                          {event.adjusted_at && (
                            <span className="mt-1 block text-[11px] font-bold text-amber-700">
                              Adjusted once
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs font-bold text-slate-700">
                          {formatDate(getEffectiveDeviceTime(event))}
                          {event.adjusted_device_ts && (
                            <span className="mt-1 block font-medium text-slate-400">
                              Original: {formatDate(event.device_ts)}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3.5 text-xs font-bold text-slate-700">
                          {formatDate(getEffectiveRecordedTime(event))}
                          {event.adjusted_scanned_at && (
                            <span className="mt-1 block font-medium text-slate-400">
                              Original: {formatDate(event.scanned_at)}
                            </span>
                          )}
                        </td>
                        <td className="max-w-xs px-4 py-3.5 text-xs font-medium text-slate-500">
                          <span className="inline-flex items-start gap-1.5">
                            {hasLocation ? (
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                            ) : null}
                            {hasLocation
                              ? `${geo.lat!.toFixed(5)}, ${geo.lng!.toFixed(5)}${geo.accuracy ? ` (${Math.round(geo.accuracy)}m)` : ''}`
                              : 'Not provided'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !error && totalPages > 1 && (
            <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-bold text-slate-500">
                Page {page} of {totalPages} · {number.format(total)} punches
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextPage = Math.max(1, page - 1)
                    setPage(nextPage)
                    void loadEvents(nextPage)
                  }}
                  disabled={page === 1 || loading}
                  className="ui-tap rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextPage = Math.min(totalPages, page + 1)
                    setPage(nextPage)
                    void loadEvents(nextPage)
                  }}
                  disabled={page >= totalPages || loading}
                  className="ui-tap rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPage(1)
                    setPageSize(Number(event.target.value))
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-black text-slate-700"
                  aria-label="Punches per page"
                >
                  {[10, 25, 50, 100, 200].map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
