'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CircleAlert,
  PlaneTakeoff,
  RefreshCw,
  Search,
  UsersRound,
} from 'lucide-react'
import {
  FlightMonitoringApiError,
  loadFlightMonitoring,
  type FlightMonitoringItem,
} from './flightMonitoringClientApi'

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function statusTone(status: string) {
  switch (status.toLowerCase()) {
    case 'scheduled':
    case 'on_schedule':
    case 'confirmed':
      return 'bg-emerald-50 text-emerald-800 ring-emerald-200'
    case 'changed':
    case 'change_marked':
    case 'awaiting_review':
      return 'bg-amber-50 text-amber-900 ring-amber-200'
    case 'cancelled':
      return 'bg-red-50 text-red-800 ring-red-200'
    default:
      return 'bg-sky-50 text-sky-800 ring-sky-200'
  }
}

function formatLocalDeparture(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return value
  const [, year, month, day, hour, minute] = match
  const date = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)),
  )
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatFlight(item: FlightMonitoringItem) {
  const airline = item.airline.iataCode.trim().toUpperCase()
  const flightNumber = item.flightNumber.trim().toUpperCase()
  const includesAirline =
    flightNumber === airline ||
    flightNumber.startsWith(`${airline} `) ||
    flightNumber.startsWith(`${airline}-`) ||
    new RegExp(`^${airline}\\d`).test(flightNumber)
  return includesAirline ? flightNumber : `${airline} ${flightNumber}`
}

function searchableText(item: FlightMonitoringItem) {
  return [
    item.ownerEmployee.fullName,
    item.leadPassenger,
    item.pnr,
    item.contactPhone || '',
    item.airline.iataCode,
    item.airline.name,
    item.flightNumber,
    item.originIata,
    item.destinationIata,
    item.scheduleStatus,
  ]
    .join(' ')
    .toLowerCase()
}

export function FlightMonitoringPanel() {
  const [items, setItems] = useState<FlightMonitoringItem[]>([])
  const [counts, setCounts] = useState({
    upcoming: 0,
    changeMarked: 0,
    awaitingFinalisation: 0,
  })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'more', signal?: AbortSignal, cursor?: string) => {
      if (mode === 'initial') setIsLoading(true)
      else if (mode === 'more') setIsLoadingMore(true)
      else setIsRefreshing(true)
      try {
        const payload = await loadFlightMonitoring(signal, cursor)
        setItems((current) => (mode === 'more' ? [...current, ...payload.items] : payload.items))
        setCounts(payload.counts)
        setNextCursor(payload.nextCursor)
        setError('')
      } catch (caught) {
        if (signal?.aborted) return
        setError(
          caught instanceof FlightMonitoringApiError
            ? caught.message
            : 'Unable to load upcoming flights. Try again.',
        )
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false)
          setIsRefreshing(false)
          setIsLoadingMore(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    const controller = new AbortController()
    void load('initial', controller.signal)
    return () => controller.abort()
  }, [load])

  const statuses = useMemo(
    () => [...new Set(items.map((item) => item.scheduleStatus))].sort((a, b) => a.localeCompare(b)),
    [items],
  )
  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter(
      (item) =>
        (status === 'all' || item.scheduleStatus === status) &&
        (!query || searchableText(item).includes(query)),
    )
  }, [items, search, status])
  return (
    <section
      id="flight-monitoring"
      aria-labelledby="upcoming-flights-title"
      className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="border-b border-slate-200 p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">
                Flight Monitoring
              </p>
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-800 ring-1 ring-sky-200">
                All agents
              </span>
            </div>
            <h2 id="upcoming-flights-title" className="mt-1 text-xl font-black text-slate-950">
              Upcoming flights
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Review active departure details across the ticketing team.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(14rem,1fr)_11rem_auto]">
            <label className="relative">
              <span className="sr-only">Search upcoming flights</span>
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search PNR, passenger, route or agent"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              />
            </label>
            <label>
              <span className="sr-only">Filter flights by status</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              >
                <option value="all">All statuses</option>
                {statuses.map((option) => (
                  <option key={option} value={option}>
                    {titleCase(option)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void load('refresh')}
              disabled={isLoading || isRefreshing || isLoadingMore}
              aria-label="Refresh upcoming flights"
              className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading || isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="sm:sr-only">Refresh</span>
            </button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 md:max-w-xl md:gap-3">
          {[
            { label: 'Upcoming', value: counts.upcoming, icon: PlaneTakeoff },
            { label: 'Changes marked', value: counts.changeMarked, icon: CalendarClock },
            {
              label: 'Awaiting finalisation',
              value: counts.awaitingFinalisation,
              icon: UsersRound,
            },
          ].map((summary) => {
            const Icon = summary.icon
            return (
              <div key={summary.label} className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                <dt className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-slate-500">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {summary.label}
                </dt>
                <dd className="mt-1 text-xl font-black text-slate-950">{summary.value}</dd>
              </div>
            )
          })}
        </dl>
      </div>

      {error && (
        <div
          role="alert"
          className="m-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {error}
            {items.length > 0 ? ' Existing departures remain visible.' : ''}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-3 p-6" role="status">
          <RefreshCw className="h-6 w-6 animate-spin text-sky-700" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Loading all-agent departures…</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex min-h-56 flex-col items-center justify-center px-5 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <CalendarClock className="h-7 w-7" aria-hidden="true" />
          </span>
          <h3 className="mt-4 text-base font-black text-slate-950">
            {items.length === 0 ? 'No upcoming flights' : 'No matching flights'}
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
            {items.length === 0
              ? 'Add an itinerary to an issued TK record and its active sectors will appear here.'
              : 'Clear the search or choose a different status.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="hidden min-w-[74rem] grid-cols-[1.15fr_0.75fr_0.8fr_1.1fr_1fr_0.5fr_0.75fr] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 lg:grid">
            <span>Departure</span>
            <span>Flight / route</span>
            <span>Agent</span>
            <span>Lead passenger</span>
            <span>Contact</span>
            <span>Passengers</span>
            <span>Status</span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredItems.map((item) => (
              <article
                key={item.sectorId}
                className="grid gap-3 px-4 py-4 transition hover:bg-slate-50/70 lg:min-w-[74rem] lg:grid-cols-[1.15fr_0.75fr_0.8fr_1.1fr_1fr_0.5fr_0.75fr] lg:items-center lg:px-5"
              >
                <div>
                  <time
                    dateTime={item.departureLocal}
                    className="text-sm font-black text-slate-950"
                  >
                    {formatLocalDeparture(item.departureLocal)}
                  </time>
                  <p className="mt-0.5 break-all text-[11px] font-semibold text-slate-500">
                    {item.originTimezone}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-sm font-black tracking-wide text-slate-950">
                    {formatFlight(item)}
                  </p>
                  <p className="mt-0.5 text-xs font-bold text-sky-800">
                    {item.originIata} → {item.destinationIata}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                    Agent
                  </p>
                  <p className="text-sm font-bold text-slate-800">{item.ownerEmployee.fullName}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                    Lead passenger
                  </p>
                  <p className="truncate text-sm font-bold text-slate-900">{item.leadPassenger}</p>
                  <p className="mt-0.5 font-mono text-xs font-black tracking-wide text-slate-500">
                    {item.pnr}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                    Contact
                  </p>
                  <p className="break-words text-sm font-semibold text-slate-700">
                    {item.contactPhone || 'Not recorded'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                    Passengers
                  </p>
                  <p className="text-sm font-black text-slate-800">{item.passengerCount}</p>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-400 lg:hidden">
                    Status
                  </p>
                  <span
                    className={`inline-flex w-fit rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusTone(item.scheduleStatus)}`}
                  >
                    {titleCase(item.scheduleStatus)}
                  </span>
                </div>
              </article>
            ))}
          </div>
          {nextCursor && (
            <div className="flex justify-center border-t border-slate-100 p-4">
              <button
                type="button"
                onClick={() => void load('more', undefined, nextCursor)}
                disabled={isLoadingMore || isRefreshing}
                className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-5 text-sm font-black text-sky-800 hover:bg-sky-100 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-4 w-4 ${isLoadingMore ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {isLoadingMore ? 'Loading…' : 'Load more departures'}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
