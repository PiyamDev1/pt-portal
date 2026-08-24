'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowDownToLine, BadgePoundSterling, Eraser, RefreshCw, Search, Users } from 'lucide-react'
import { LowFareQueue } from './LowFareQueue'
import { loadLowFareQueue, LowFareApiError } from './lowFareClientApi'
import type {
  LowFareAdjustmentResult,
  LowFareAirline,
  LowFareOwner,
  LowFareQueueFilters,
  LowFareQueueItem,
} from './types'

const EMPTY_FILTERS: LowFareQueueFilters = {
  pnr: '',
  airline: '',
  owner: '',
  departureFrom: '',
  departureTo: '',
}

function normalizeFilters(filters: LowFareQueueFilters): LowFareQueueFilters {
  return {
    ...filters,
    pnr: filters.pnr.trim().toUpperCase().replace(/\s+/g, ''),
    airline: filters.airline.trim().toUpperCase(),
  }
}

function sameFilters(left: LowFareQueueFilters, right: LowFareQueueFilters) {
  return (Object.keys(left) as Array<keyof LowFareQueueFilters>).every(
    (key) => left[key] === right[key],
  )
}

export function LowFareClient() {
  const [items, setItems] = useState<LowFareQueueItem[]>([])
  const [hasLoaded, setHasLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [draftFilters, setDraftFilters] = useState<LowFareQueueFilters>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<LowFareQueueFilters>(EMPTY_FILTERS)
  const [filterError, setFilterError] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [knownAirlines, setKnownAirlines] = useState<Record<string, LowFareAirline>>({})
  const [knownOwners, setKnownOwners] = useState<Record<string, LowFareOwner>>({})
  const requestSequence = useRef(0)

  const rememberFilterOptions = useCallback((nextItems: LowFareQueueItem[]) => {
    setKnownAirlines((current) => {
      const next = { ...current }
      nextItems.forEach((item) => {
        next[item.airline.iataCode] = item.airline
      })
      return next
    })
    setKnownOwners((current) => {
      const next = { ...current }
      nextItems.forEach((item) => {
        next[item.owner.employeeId] = item.owner
      })
      return next
    })
  }, [])

  const requestQueue = useCallback(
    async (
      filters: LowFareQueueFilters,
      options: { cursor?: string; append?: boolean; initial?: boolean } = {},
    ) => {
      const requestId = ++requestSequence.current
      if (options.initial) setIsLoading(true)
      else if (options.append) setIsLoadingMore(true)
      else setIsRefreshing(true)

      try {
        const page = await loadLowFareQueue(filters, { cursor: options.cursor, limit: 50 })
        if (requestId !== requestSequence.current) return
        rememberFilterOptions(page.items)
        setItems((current) => {
          if (!options.append) return page.items
          const byBooking = new Map(current.map((item) => [item.bookingId, item]))
          page.items.forEach((item) => byBooking.set(item.bookingId, item))
          return [...byBooking.values()]
        })
        setHasMore(page.hasMore)
        setNextCursor(page.nextCursor)
        setLoadError('')
        setHasLoaded(true)
      } catch (error) {
        if (requestId !== requestSequence.current) return
        setLoadError(
          error instanceof LowFareApiError
            ? error.message
            : 'Unable to load the shared Low Fare queue. Try again.',
        )
        setHasLoaded(true)
      } finally {
        if (requestId === requestSequence.current) {
          setIsLoading(false)
          setIsRefreshing(false)
          setIsLoadingMore(false)
        }
      }
    },
    [rememberFilterOptions],
  )

  useEffect(() => {
    void requestQueue(EMPTY_FILTERS, { initial: true })
  }, [requestQueue])

  const airlineOptions = useMemo(
    () =>
      Object.values(knownAirlines).sort((left, right) =>
        left.iataCode.localeCompare(right.iataCode),
      ),
    [knownAirlines],
  )
  const ownerOptions = useMemo(
    () =>
      Object.values(knownOwners).sort((left, right) => left.fullName.localeCompare(right.fullName)),
    [knownOwners],
  )
  const adjustedCount = useMemo(
    () => items.filter((item) => item.latestAdjustment !== null).length,
    [items],
  )

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizeFilters(draftFilters)
    if (
      normalized.departureFrom &&
      normalized.departureTo &&
      normalized.departureFrom > normalized.departureTo
    ) {
      setFilterError('Departure from cannot be after departure to.')
      return
    }
    setFilterError('')
    setDraftFilters(normalized)
    setAppliedFilters(normalized)
    setSelectedBookingId(null)
    void requestQueue(normalized)
  }

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS)
    setAppliedFilters(EMPTY_FILTERS)
    setFilterError('')
    setSelectedBookingId(null)
    void requestQueue(EMPTY_FILTERS)
  }

  const refreshAfterSave = async (_result: LowFareAdjustmentResult) => {
    setSelectedBookingId(null)
    await requestQueue(appliedFilters)
  }

  if (isLoading && !hasLoaded) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="h-32 animate-pulse rounded-[1.75rem] bg-slate-200" />
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />
        <p className="text-center text-sm font-semibold text-slate-500">
          Loading the shared Low Fare queue…
        </p>
      </div>
    )
  }

  if (!hasLoaded || (loadError && items.length === 0)) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"
      >
        <h1 className="text-xl font-black text-slate-950">Low Fare queue unavailable</h1>
        <p className="mt-2 text-sm text-red-700">{loadError}</p>
        <button
          type="button"
          onClick={() => void requestQueue(appliedFilters, { initial: true })}
          className="ui-tap ui-focus mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-bold text-white"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-sky-950 via-sky-800 to-slate-900 p-5 text-white shadow-xl shadow-sky-950/15 md:p-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-100">
              All-agent ticket queue
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Low Fare</h1>
            <p className="mt-2 text-sm leading-6 text-sky-50/85 md:text-base">
              Review issued tickets and append changed whole-PNR supplier fares without changing the
              original ticket record.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:min-w-64">
            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/20">
              <p className="text-[10px] font-black uppercase tracking-wide text-sky-100">
                Visible tickets
              </p>
              <p className="mt-1 text-2xl font-black">{items.length}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/20">
              <p className="text-[10px] font-black uppercase tracking-wide text-sky-100">
                Adjusted
              </p>
              <p className="mt-1 text-2xl font-black">{adjustedCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section
        aria-labelledby="low-fare-policy-title"
        className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 via-white to-sky-50 p-4 shadow-sm md:p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
            <BadgePoundSterling className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="low-fare-policy-title" className="font-black text-slate-950">
              How the difference is recorded
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              A positive difference means the replacement supplier fare is lower. A higher
              replacement fare is recorded as an increase. Commission handles the agent policy
              separately; this operational queue does not calculate an agent amount.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="low-fare-queue-title" className="space-y-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-800">
              Shared queue
            </p>
            <h2 id="low-fare-queue-title" className="mt-1 text-xl font-black text-slate-950">
              Issued tickets from all agents
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {items.length} ticket{items.length === 1 ? '' : 's'} visible
              {hasMore ? ' · more available' : ''}
            </p>
          </div>

          <form
            aria-label="Low Fare queue filters"
            onSubmit={applyFilters}
            className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[9rem_7rem_12rem_10rem_10rem_auto_auto]"
          >
            <label className="text-xs font-bold text-slate-700">
              Exact PNR
              <input
                type="search"
                value={draftFilters.pnr}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    pnr: event.target.value.toUpperCase().replace(/\s+/g, ''),
                  }))
                }
                maxLength={20}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm font-bold uppercase text-slate-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                placeholder="ABC123"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Airline
              <input
                list="low-fare-airlines"
                value={draftFilters.airline}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    airline: event.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                maxLength={2}
                autoComplete="off"
                spellCheck={false}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm font-bold uppercase text-slate-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
                placeholder="TK"
              />
              <datalist id="low-fare-airlines">
                {airlineOptions.map((airline) => (
                  <option key={airline.id} value={airline.iataCode} label={airline.name} />
                ))}
              </datalist>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Ticket owner
              <select
                value={draftFilters.owner}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, owner: event.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
              >
                <option value="">All agents</option>
                {ownerOptions.map((owner) => (
                  <option key={owner.employeeId} value={owner.employeeId}>
                    {owner.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Departure from
              <input
                type="date"
                value={draftFilters.departureFrom}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    departureFrom: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <label className="text-xs font-bold text-slate-700">
              Departure to
              <input
                type="date"
                value={draftFilters.departureTo}
                onChange={(event) =>
                  setDraftFilters((current) => ({ ...current, departureTo: event.target.value }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-sky-700 focus:ring-2 focus:ring-sky-100"
              />
            </label>

            <button
              type="submit"
              disabled={isRefreshing}
              className="ui-tap ui-focus mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-800 px-4 text-sm font-black text-white hover:bg-sky-900 disabled:opacity-50"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Search
            </button>
            <button
              type="button"
              onClick={clearFilters}
              disabled={isRefreshing || sameFilters(draftFilters, EMPTY_FILTERS)}
              className="ui-tap ui-focus mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Eraser className="h-4 w-4" aria-hidden="true" />
              Clear
            </button>
          </form>
        </div>

        {filterError && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 ring-1 ring-red-200"
          >
            {filterError}
          </div>
        )}

        {loadError && items.length > 0 && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{loadError} Existing results remain visible.</span>
            <button
              type="button"
              onClick={() => void requestQueue(appliedFilters)}
              className="ui-focus inline-flex items-center gap-1.5 font-black underline"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </button>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void requestQueue(appliedFilters)}
            disabled={isRefreshing}
            aria-label="Refresh Low Fare queue"
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {isRefreshing ? 'Refreshing…' : 'Refresh queue'}
          </button>
        </div>

        <LowFareQueue
          items={items}
          selectedBookingId={selectedBookingId}
          onSelect={setSelectedBookingId}
          onSaved={refreshAfterSave}
        />

        {hasMore && nextCursor && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() =>
                void requestQueue(appliedFilters, { cursor: nextCursor, append: true })
              }
              disabled={isLoadingMore}
              className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-5 text-sm font-black text-sky-900 hover:bg-sky-100 disabled:opacity-50"
            >
              <ArrowDownToLine className="h-4 w-4" aria-hidden="true" />
              {isLoadingMore ? 'Loading…' : 'Load more tickets'}
            </button>
          </div>
        )}

        <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-xs font-semibold text-slate-500">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          The queue includes eligible issued tickets owned by every Ticketing agent.
        </p>
      </section>
    </div>
  )
}
