'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Search, TicketCheck } from 'lucide-react'
import { TicketQuickEntryForm } from './TicketQuickEntryForm'
import { TicketFollowOnEntryForm } from './TicketFollowOnEntryForm'
import { TicketLedgerList } from './TicketLedgerList'
import { TicketCompletionDrawer } from './TicketCompletionDrawer'
import { TicketServicePaymentDialog } from './TicketServicePaymentDialog'
import { TicketAttributionDialog } from './TicketAttributionDialog'
import { TicketDateCorrectionDialog } from './TicketDateCorrectionDialog'
import { TicketItineraryDrawer } from './TicketItineraryDrawer'
import { TicketArchiveDialog } from './TicketArchiveDialog'
import { TicketChangeRequestDialog } from './TicketChangeRequestDialog'
import { TicketChangeRequestsPanel } from './TicketChangeRequestsPanel'
import {
  loadTicketLedger,
  reviewTicketChangeRequest,
  TicketLedgerApiError,
} from './ledgerClientApi'
import type {
  TicketChangeRequest,
  TicketChangeRequestType,
  TicketLedgerItem,
  TicketLedgerPayload,
} from './types'

export function TicketingLedgerClient() {
  const [payload, setPayload] = useState<TicketLedgerPayload | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null)
  const [selectedPaymentItem, setSelectedPaymentItem] = useState<TicketLedgerItem | null>(null)
  const [selectedItineraryItem, setSelectedItineraryItem] = useState<TicketLedgerItem | null>(null)
  const [selectedAttributionItem, setSelectedAttributionItem] = useState<TicketLedgerItem | null>(
    null,
  )
  const [selectedDateItem, setSelectedDateItem] = useState<TicketLedgerItem | null>(null)
  const [selectedArchiveItem, setSelectedArchiveItem] = useState<Pick<
    TicketLedgerItem,
    'bookingId' | 'pnr'
  > | null>(null)
  const [selectedChangeRequest, setSelectedChangeRequest] = useState<{
    item: Pick<TicketLedgerItem, 'bookingId' | 'pnr'>
    requestType: TicketChangeRequestType
  } | null>(null)
  const [activeAmendmentRequestId, setActiveAmendmentRequestId] = useState<string | null>(null)
  const [requestRefreshToken, setRequestRefreshToken] = useState(0)
  const [entryType, setEntryType] = useState<'TK' | 'DC' | 'R-ER'>('TK')

  const refresh = useCallback(
    async (initial = false, cursor?: string) => {
      if (initial) setIsLoading(true)
      else if (cursor) setIsLoadingMore(true)
      else setIsRefreshing(true)
      try {
        const nextPayload = await loadTicketLedger({ search, cursor })
        setPayload((current) =>
          cursor && current
            ? { ...nextPayload, items: [...current.items, ...nextPayload.items] }
            : nextPayload,
        )
        setNextCursor(nextPayload.nextCursor)
        setLoadError('')
      } catch (error) {
        setLoadError(
          error instanceof TicketLedgerApiError
            ? error.message
            : 'Unable to load your sales ledger. Try again.',
        )
      } finally {
        setIsLoading(false)
        setIsLoadingMore(false)
        setIsRefreshing(false)
      }
    },
    [search],
  )

  useEffect(() => {
    void refresh(true)
  }, [refresh])

  useEffect(() => {
    setCurrentTimeMs(Date.now())
    const interval = window.setInterval(() => setCurrentTimeMs(Date.now()), 60_000)
    return () => window.clearInterval(interval)
  }, [])

  const filteredItems = useMemo(() => {
    if (!payload) return []
    const query = search.trim().toLowerCase()
    return payload.items.filter((item) => {
      const matchesStatus =
        status === 'all' ||
        item.operationalStatus === status ||
        (status === 'needs_details' && item.detailsStatus === 'needs_details') ||
        (status === 'overdue_action' &&
          item.operationalStatus === 'held' &&
          item.timeLimitAt !== null &&
          currentTimeMs > 0 &&
          new Date(item.timeLimitAt).getTime() <= currentTimeMs)
      const matchesSearch =
        !query ||
        item.pnr.toLowerCase().includes(query) ||
        item.customerName.toLowerCase().includes(query) ||
        item.airline.iataCode.toLowerCase().includes(query) ||
        item.airline.name.toLowerCase().includes(query) ||
        item.responsibleEmployee.fullName.toLowerCase().includes(query) ||
        item.assistantEmployees.some((employee) => employee.fullName.toLowerCase().includes(query))
      return matchesStatus && matchesSearch
    })
  }, [currentTimeMs, payload, search, status])

  if (isLoading && !payload) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="h-28 animate-pulse rounded-[1.75rem] bg-slate-200" />
        <div className="h-80 animate-pulse rounded-2xl bg-slate-200" />
        <p className="text-center text-sm font-semibold text-slate-500">
          Loading your sales ledger…
        </p>
      </div>
    )
  }

  if (!payload) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm"
      >
        <h1 className="text-xl font-black text-slate-950">Sales ledger unavailable</h1>
        <p className="mt-2 text-sm text-red-700">{loadError}</p>
        <button
          type="button"
          onClick={() => void refresh(true)}
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
      <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#8b1e2d] to-slate-900 p-5 text-white shadow-xl shadow-red-950/15 md:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">
              Ticketing operations
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              {payload.context.canManageAttribution ? 'Team Sales Ledger' : 'My Sales Ledger'}
            </h1>
            <p className="mt-2 text-sm text-red-50/85">
              {payload.context.canManageAttribution
                ? 'Fast TK, date-change and reissue entry with audited staff attribution and the latest team records for '
                : 'Fast TK, date-change and reissue entry with your own ticket records for '}
              {payload.context.locationName || 'your branch'}.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/20">
            <TicketCheck className="h-7 w-7" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold text-red-100">Signed in as</p>
              <p className="text-sm font-black">{payload.context.employeeName}</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="ticket-entry-type-title" className="space-y-3">
        <div>
          <p
            id="ticket-entry-type-title"
            className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]"
          >
            What are you recording?
          </p>
          <div
            role="group"
            aria-labelledby="ticket-entry-type-title"
            className="mt-2 inline-flex w-full rounded-xl border border-slate-200 bg-slate-100 p-1 sm:w-auto"
          >
            {(['TK', 'DC', 'R-ER'] as const).map((serviceType) => (
              <button
                key={serviceType}
                type="button"
                onClick={() => setEntryType(serviceType)}
                aria-pressed={entryType === serviceType}
                className={`ui-tap ui-focus min-h-11 flex-1 rounded-lg px-5 text-sm font-black transition sm:flex-none ${
                  entryType === serviceType
                    ? 'bg-white text-[#8b1e2d] shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                {serviceType === 'TK'
                  ? 'New ticket'
                  : serviceType === 'DC'
                    ? 'Date change'
                    : 'Reissue'}
              </button>
            ))}
          </div>
        </div>

        {entryType === 'TK' ? (
          <TicketQuickEntryForm
            airlines={payload.airlines}
            timezone={payload.context.timezone}
            employeeId={payload.context.employeeId}
            employeeName={payload.context.employeeName}
            canManageAttribution={payload.context.canManageAttribution}
            attributionEmployees={payload.context.attributionEmployees}
            onCreated={() => refresh()}
          />
        ) : (
          <TicketFollowOnEntryForm
            key={entryType}
            serviceType={entryType}
            timezone={payload.context.timezone}
            onCreated={() => refresh()}
          />
        )}
      </section>

      {payload.context.canArchiveRecords && (
        <TicketChangeRequestsPanel
          refreshToken={requestRefreshToken}
          onAmend={(request: TicketChangeRequest) => {
            setActiveAmendmentRequestId(request.id)
            setSelectedBookingId(request.bookingId)
          }}
          onDelete={(request: TicketChangeRequest) =>
            setSelectedArchiveItem({ bookingId: request.bookingId, pnr: request.pnr })
          }
        />
      )}

      <section aria-labelledby="my-ticket-records-title" className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              {payload.context.canManageAttribution ? 'Team records' : 'Own records'}
            </p>
            <h2 id="my-ticket-records-title" className="mt-1 text-xl font-black text-slate-950">
              Latest ticket records
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Showing {filteredItems.length} of {payload.items.length} loaded ticket records
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(15rem,1fr)_11rem_auto]">
            <label className="relative text-xs font-bold text-slate-700">
              <span className="sr-only">Search your tickets</span>
              <Search
                className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search PNR, customer, airline or staff"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              />
            </label>
            <label className="text-xs font-bold text-slate-700">
              <span className="sr-only">Filter by ticket state</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
              >
                <option value="all">All states</option>
                <option value="needs_details">Needs details</option>
                <option value="overdue_action">Overdue action</option>
                <option value="held">Held</option>
                <option value="issued">Issued</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
                <option value="part_refunded">Part refunded</option>
                <option value="refunded">Refunded</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isRefreshing}
              aria-label="Refresh sales ledger"
              className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span className="sm:sr-only">Refresh</span>
            </button>
          </div>
        </div>

        {loadError && (
          <div
            role="alert"
            className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"
          >
            {loadError} Existing records remain visible.
          </div>
        )}

        <TicketLedgerList
          items={filteredItems}
          employeeId={payload.context.employeeId}
          currentTimeMs={currentTimeMs}
          onComplete={(item) => setSelectedBookingId(item.bookingId)}
          onMarkPaid={setSelectedPaymentItem}
          onEditItinerary={setSelectedItineraryItem}
          canManageRecords={payload.context.canManageRecords}
          canManageAttribution={payload.context.canManageAttribution}
          canArchiveRecords={payload.context.canArchiveRecords}
          onCorrectAttribution={setSelectedAttributionItem}
          onCorrectDates={setSelectedDateItem}
          onArchive={setSelectedArchiveItem}
          onRequestChange={(item, requestType) => setSelectedChangeRequest({ item, requestType })}
        />

        {nextCursor && (
          <button
            type="button"
            onClick={() => void refresh(false, nextCursor)}
            disabled={isLoadingMore || isRefreshing}
            className="ui-tap ui-focus mx-auto inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {isLoadingMore ? 'Loading more records' : 'Load more records'}
          </button>
        )}
      </section>

      <TicketCompletionDrawer
        bookingId={selectedBookingId}
        timezone={payload.context.timezone}
        onClose={() => {
          setSelectedBookingId(null)
          setActiveAmendmentRequestId(null)
        }}
        onSaved={async () => {
          if (activeAmendmentRequestId) {
            await reviewTicketChangeRequest(activeAmendmentRequestId, 'fulfilled')
            setActiveAmendmentRequestId(null)
            setRequestRefreshToken((current) => current + 1)
          }
          await refresh()
        }}
      />

      <TicketItineraryDrawer
        item={selectedItineraryItem}
        airlines={payload.airlines}
        onClose={() => setSelectedItineraryItem(null)}
        onSaved={() => refresh()}
      />

      {selectedPaymentItem && (
        <TicketServicePaymentDialog
          key={selectedPaymentItem.transactionId}
          item={selectedPaymentItem}
          timezone={payload.context.timezone}
          onClose={() => setSelectedPaymentItem(null)}
          onSaved={() => refresh()}
        />
      )}

      {payload.context.canManageAttribution && selectedAttributionItem && (
        <TicketAttributionDialog
          key={`${selectedAttributionItem.transactionId}:${selectedAttributionItem.attributionVersion}`}
          item={selectedAttributionItem}
          employees={payload.context.attributionEmployees}
          onClose={() => setSelectedAttributionItem(null)}
          onSaved={() => refresh()}
        />
      )}

      {payload.context.canManageRecords && selectedDateItem && (
        <TicketDateCorrectionDialog
          key={`${selectedDateItem.transactionId}:${selectedDateItem.transactionVersion}`}
          item={selectedDateItem}
          onClose={() => setSelectedDateItem(null)}
          onSaved={() => refresh()}
        />
      )}

      {payload.context.canArchiveRecords && selectedArchiveItem && (
        <TicketArchiveDialog
          key={selectedArchiveItem.bookingId}
          item={selectedArchiveItem}
          onClose={() => setSelectedArchiveItem(null)}
          onArchived={async () => {
            setRequestRefreshToken((current) => current + 1)
            await refresh()
          }}
        />
      )}

      {selectedChangeRequest && (
        <TicketChangeRequestDialog
          key={`${selectedChangeRequest.item.bookingId}:${selectedChangeRequest.requestType}`}
          item={selectedChangeRequest.item}
          requestType={selectedChangeRequest.requestType}
          onClose={() => setSelectedChangeRequest(null)}
          onRequested={async () => {
            setRequestRefreshToken((current) => current + 1)
            await refresh()
          }}
        />
      )}
    </div>
  )
}
