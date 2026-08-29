'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  TicketX,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  TICKET_VOUCHER_STATUSES,
  type TicketingVoucherItem,
  type TicketingVoucherStatus,
} from '@/lib/ticketing/voucherContracts'
import {
  loadTicketCompletionDetail,
  loadTicketLedger,
  TicketLedgerApiError,
} from '../ledger/ledgerClientApi'
import type { TicketCompletionDetail, TicketLedgerContext, TicketLedgerItem } from '../ledger/types'
import { createTicketVoucher, loadTicketVouchers, TicketVoucherApiError } from './voucherClientApi'
import { VoucherLifecyclePanel } from './VoucherLifecyclePanel'

type Filters = { pnr: string; status: TicketingVoucherStatus | '' }

const EMPTY_FILTERS: Filters = { pnr: '', status: '' }

const STATUS_LABELS: Record<TicketingVoucherStatus, string> = {
  unclaimed: 'Unclaimed',
  claim_submitted: 'Claim submitted',
  airline_credit_confirmed: 'Airline credit confirmed',
  part_used: 'Part used',
  used_on_new_ticket: 'Used on new ticket',
  refund_received: 'Refund received',
  expired: 'Expired',
  closed: 'Closed',
}

function normalizedPnr(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function localToday() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ticket-voucher-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function passengerKey(passenger: TicketCompletionDetail['passengers'][number]) {
  return `${passenger.passengerType}:${passenger.position}`
}

function VoucherCard({
  voucher,
  expanded,
  canManage,
  onToggle,
  onUpdated,
}: {
  voucher: TicketingVoucherItem
  expanded: boolean
  canManage: boolean
  onToggle: () => void
  onUpdated: () => Promise<void>
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-black text-slate-950">{voucher.pnr}</span>
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
              {STATUS_LABELS[voucher.status]}
            </span>
          </div>
          <p className="mt-1 text-sm font-bold text-slate-700">
            {voucher.airline.iataCode} · {voucher.passengerName || 'Passenger name incomplete'} ·{' '}
            {voucher.passengerType}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">{voucher.ticketNumber}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Claim by</p>
          <p className="mt-1 text-sm font-black text-slate-950">
            {formatDate(voucher.claimByDate)}
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
          <span className="font-bold text-slate-500">Value</span>
          <p className="mt-0.5 font-black text-slate-800">
            {voucher.confirmedValueGbp === null ? 'Not confirmed' : `£${voucher.confirmedValueGbp}`}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
          <span className="font-bold text-slate-500">Ticket owner</span>
          <p className="mt-0.5 truncate font-black text-slate-800">{voucher.owner.fullName}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
          <span className="font-bold text-slate-500">Follow-up owner</span>
          <p className="mt-0.5 truncate font-black text-slate-800">
            {voucher.followUpOwner.fullName}
          </p>
        </div>
      </div>
      {(voucher.airlineReference || voucher.notes) && (
        <p className="mt-3 text-xs leading-5 text-slate-600">
          {voucher.airlineReference ? `Reference: ${voucher.airlineReference}` : ''}
          {voucher.airlineReference && voucher.notes ? ' · ' : ''}
          {voucher.notes || ''}
        </p>
      )}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-xs font-black text-slate-700"
      >
        {expanded ? (
          <ChevronUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        )}
        {expanded ? 'Hide lifecycle' : 'View / update lifecycle'}
      </button>
      {expanded && (
        <VoucherLifecyclePanel voucher={voucher} canManage={canManage} onUpdated={onUpdated} />
      )}
    </article>
  )
}

export function TicketVoucherClient() {
  const [items, setItems] = useState<TicketingVoucherItem[]>([])
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS)
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [canManageLifecycle, setCanManageLifecycle] = useState(false)
  const [expandedVoucherId, setExpandedVoucherId] = useState('')
  const requestSequence = useRef(0)

  const [lookupPnr, setLookupPnr] = useState('')
  const [matches, setMatches] = useState<TicketLedgerItem[]>([])
  const [ledgerContext, setLedgerContext] = useState<TicketLedgerContext | null>(null)
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [detail, setDetail] = useState<TicketCompletionDetail | null>(null)
  const [selectedPassengerKey, setSelectedPassengerKey] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [cancellationDate, setCancellationDate] = useState(localToday())
  const [claimByDate, setClaimByDate] = useState('')
  const [followUpEmployeeId, setFollowUpEmployeeId] = useState('')
  const [airlineReference, setAirlineReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())

  const requestVouchers = useCallback(
    async (filters: Filters, options: { cursor?: string; append?: boolean } = {}) => {
      const requestId = ++requestSequence.current
      if (options.append) setIsLoadingMore(true)
      else setIsLoading(true)
      try {
        const page = await loadTicketVouchers(filters, { cursor: options.cursor })
        if (requestId !== requestSequence.current) return
        setItems((current) => {
          if (!options.append) return page.items
          const merged = new Map(current.map((item) => [item.id, item]))
          page.items.forEach((item) => merged.set(item.id, item))
          return [...merged.values()]
        })
        setNextCursor(page.nextCursor)
        setCanManageLifecycle(page.context.canManage)
        setLoadError('')
      } catch (error) {
        if (requestId !== requestSequence.current) return
        setLoadError(
          error instanceof TicketVoucherApiError
            ? error.message
            : 'Unable to load Ticket Vouchers.',
        )
      } finally {
        if (requestId === requestSequence.current) {
          setIsLoading(false)
          setIsLoadingMore(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    void requestVouchers(EMPTY_FILTERS)
  }, [requestVouchers])

  const selectedTicket = useMemo(
    () => matches.find((ticket) => ticket.bookingId === selectedBookingId) || null,
    [matches, selectedBookingId],
  )
  const eligiblePassengers = useMemo(
    () => detail?.passengers.filter((passenger) => Boolean(passenger.ticketNumber?.trim())) || [],
    [detail],
  )
  const selectedPassenger =
    eligiblePassengers.find((passenger) => passengerKey(passenger) === selectedPassengerKey) || null
  const canOverrideFollowUp = ledgerContext?.canManageRecords === true
  const issueDate = selectedTicket?.issuedAt?.slice(0, 10) || ''

  const selectTicket = async (bookingId: string) => {
    setSelectedBookingId(bookingId)
    setDetail(null)
    setSelectedPassengerKey('')
    const ticket = matches.find((candidate) => candidate.bookingId === bookingId)
    setFollowUpEmployeeId(ticket?.responsibleEmployee.id || '')
    if (!bookingId) return
    setIsLoadingDetail(true)
    setLookupError('')
    try {
      const result = await loadTicketCompletionDetail(bookingId)
      setDetail(result.detail)
      const eligible = result.detail.passengers.filter((passenger) =>
        Boolean(passenger.ticketNumber?.trim()),
      )
      if (eligible.length === 1) setSelectedPassengerKey(passengerKey(eligible[0]))
    } catch (error) {
      setLookupError(
        error instanceof TicketLedgerApiError
          ? error.message
          : 'Unable to load the passenger tickets.',
      )
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const lookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const pnr = normalizedPnr(lookupPnr)
    if (!pnr) {
      setLookupError('Enter an exact PNR.')
      return
    }
    setLookupPnr(pnr)
    setIsLookingUp(true)
    setLookupError('')
    setMatches([])
    setDetail(null)
    setSelectedBookingId('')
    setSelectedPassengerKey('')
    try {
      const payload = await loadTicketLedger({ search: pnr })
      const exact = payload.items.filter(
        (ticket) =>
          normalizedPnr(ticket.pnr) === pnr &&
          ticket.serviceType === 'TK' &&
          ticket.operationalStatus.toLowerCase() === 'issued',
      )
      setMatches(exact)
      setLedgerContext(payload.context)
      if (exact.length === 0) {
        setLookupError('No issued TK ticket with that exact PNR is visible in the ledger.')
      } else if (exact.length === 1) {
        await selectTicket(exact[0].bookingId)
        setFollowUpEmployeeId(exact[0].responsibleEmployee.id)
      }
    } catch (error) {
      setLookupError(
        error instanceof TicketLedgerApiError ? error.message : 'Unable to find that ticket.',
      )
    } finally {
      setIsLookingUp(false)
    }
  }

  const saveVoucher = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedTicket || !selectedPassenger || isSaving) return
    if (issueDate && cancellationDate < issueDate) {
      setLookupError('Cancellation date cannot be before the ticket issue date.')
      return
    }
    setIsSaving(true)
    setLookupError('')
    try {
      const result = await createTicketVoucher(
        {
          bookingId: selectedTicket.bookingId,
          passengerType: selectedPassenger.passengerType,
          passengerPosition: selectedPassenger.position,
          followUpEmployeeId: followUpEmployeeId || null,
          cancellationDate,
          claimByDate: claimByDate || null,
          airlineReference: airlineReference.trim() || null,
          notes: notes.trim() || null,
        },
        idempotencyKey.current,
      )
      toast.success(
        result.idempotentReplay
          ? 'Ticket Voucher was already saved.'
          : `Ticket Voucher created. Claim by ${formatDate(result.claimByDate)}.`,
      )
      idempotencyKey.current = newIdempotencyKey()
      setSelectedPassengerKey('')
      setAirlineReference('')
      setNotes('')
      setClaimByDate('')
      await requestVouchers(appliedFilters)
    } catch (error) {
      setLookupError(
        error instanceof TicketVoucherApiError
          ? error.message
          : 'Unable to create the Ticket Voucher.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const filters = { ...draftFilters, pnr: normalizedPnr(draftFilters.pnr) }
    setDraftFilters(filters)
    setAppliedFilters(filters)
    void requestVouchers(filters)
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#8b1e2d] to-slate-900 p-5 text-white shadow-xl shadow-red-950/15 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">
              Cancelled-ticket recovery
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Ticket Vouchers</h1>
            <p className="mt-2 text-sm leading-6 text-red-50/85 md:text-base">
              Keep cancelled passenger tickets visible until their airline claim or reuse is
              completed. Value stays unknown until the airline confirms it.
            </p>
          </div>
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <TicketX className="h-8 w-8" aria-hidden="true" />
          </span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Plus className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-xl font-black text-slate-950">Create from an issued ticket</h2>
            <p className="mt-1 text-sm text-slate-600">
              Search the exact PNR, then choose the individual passenger ticket that was cancelled.
            </p>
          </div>
        </div>

        <form onSubmit={lookup} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="voucher-pnr-lookup">
            Exact PNR
          </label>
          <input
            id="voucher-pnr-lookup"
            value={lookupPnr}
            onChange={(event) => setLookupPnr(event.target.value.toUpperCase())}
            placeholder="Exact PNR"
            maxLength={20}
            className="min-h-11 flex-1 rounded-xl border border-slate-300 px-3 text-sm font-bold uppercase outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
          />
          <button
            type="submit"
            disabled={isLookingUp}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-50"
          >
            {isLookingUp ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Search className="h-4 w-4" aria-hidden="true" />
            )}
            Find ticket
          </button>
        </form>

        {matches.length > 1 && (
          <label className="mt-4 block text-sm font-bold text-slate-700">
            Ticket record
            <select
              value={selectedBookingId}
              onChange={(event) => void selectTicket(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            >
              <option value="">Select the correct ticket</option>
              {matches.map((ticket) => (
                <option key={ticket.bookingId} value={ticket.bookingId}>
                  {ticket.airline.iataCode} · {ticket.customerName} ·{' '}
                  {ticket.issuedAt
                    ? formatDate(ticket.issuedAt.slice(0, 10))
                    : 'Issue date missing'}{' '}
                  · {ticket.responsibleEmployee.fullName}
                </option>
              ))}
            </select>
          </label>
        )}

        {isLoadingDetail && (
          <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-600">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading passenger
            tickets…
          </p>
        )}

        {detail && selectedTicket && (
          <form onSubmit={saveVoucher} className="mt-5 space-y-4 border-t border-slate-200 pt-5">
            <div className="rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <p className="font-black text-slate-950">
                {selectedTicket.airline.iataCode} · {selectedTicket.customerName}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-600">
                Issued {issueDate ? formatDate(issueDate) : 'date unavailable'} · Responsible:{' '}
                {selectedTicket.responsibleEmployee.fullName}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="text-sm font-bold text-slate-700">
                Passenger ticket
                <select
                  required
                  value={selectedPassengerKey}
                  onChange={(event) => setSelectedPassengerKey(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                >
                  <option value="">Select passenger ticket</option>
                  {eligiblePassengers.map((passenger) => (
                    <option key={passengerKey(passenger)} value={passengerKey(passenger)}>
                      {passenger.passengerType} {passenger.position} ·{' '}
                      {passenger.fullName || 'Name incomplete'} · {passenger.ticketNumber}
                    </option>
                  ))}
                </select>
                {eligiblePassengers.length === 0 && (
                  <span className="mt-1 block text-xs font-semibold text-amber-700">
                    Complete a passenger ticket number in the Sales Ledger first.
                  </span>
                )}
              </label>

              <label className="text-sm font-bold text-slate-700">
                Cancellation date
                <input
                  type="date"
                  required
                  min={issueDate || undefined}
                  max={localToday()}
                  value={cancellationDate}
                  onChange={(event) => setCancellationDate(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                />
              </label>

              {canOverrideFollowUp && (
                <label className="text-sm font-bold text-slate-700">
                  Follow-up owner
                  <select
                    value={followUpEmployeeId}
                    onChange={(event) => setFollowUpEmployeeId(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  >
                    {ledgerContext?.attributionEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.fullName}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {canOverrideFollowUp && (
                <label className="text-sm font-bold text-slate-700">
                  Claim-by override
                  <input
                    type="date"
                    min={cancellationDate || undefined}
                    value={claimByDate}
                    onChange={(event) => setClaimByDate(event.target.value)}
                    className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  />
                  <span className="mt-1 block text-xs font-medium text-slate-500">
                    Leave blank for issue date plus 11 months.
                  </span>
                </label>
              )}

              <label className="text-sm font-bold text-slate-700">
                Airline/supplier reference
                <input
                  value={airlineReference}
                  onChange={(event) => setAirlineReference(event.target.value)}
                  maxLength={120}
                  className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                />
              </label>

              <label className="text-sm font-bold text-slate-700 md:col-span-2 xl:col-span-3">
                Notes
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={2000}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isSaving || !selectedPassenger}
              className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white disabled:opacity-50"
            >
              {isSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              Save Ticket Voucher
            </button>
          </form>
        )}

        {lookupError && (
          <p
            role="alert"
            className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 ring-1 ring-red-200"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {lookupError}
          </p>
        )}
      </section>

      <section aria-labelledby="voucher-register-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Follow-up register
            </p>
            <h2 id="voucher-register-title" className="mt-1 text-xl font-black text-slate-950">
              Visible Ticket Vouchers
            </h2>
          </div>
          <button
            type="button"
            onClick={() => void requestVouchers(appliedFilters)}
            disabled={isLoading}
            className="ui-tap ui-focus inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>

        <form
          onSubmit={applyFilters}
          className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="text-sm font-bold text-slate-700">
            PNR
            <input
              value={draftFilters.pnr}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  pnr: event.target.value.toUpperCase(),
                }))
              }
              maxLength={20}
              placeholder="All PNRs"
              className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm uppercase outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </label>
          <label className="text-sm font-bold text-slate-700">
            Status
            <select
              value={draftFilters.status}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  status: event.target.value as Filters['status'],
                }))
              }
              className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            >
              <option value="">All statuses</option>
              {TICKET_VOUCHER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="ui-tap ui-focus min-h-10 self-end rounded-xl bg-slate-900 px-5 text-sm font-black text-white"
          >
            Apply
          </button>
        </form>

        {loadError && (
          <div
            className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800 ring-1 ring-red-200"
            role="alert"
          >
            {loadError}
          </div>
        )}

        {isLoading && items.length === 0 ? (
          <div className="mt-4 flex min-h-40 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Loading Ticket
            Vouchers…
          </div>
        ) : items.length === 0 && !loadError ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
            <CalendarClock className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-black text-slate-800">
              No Ticket Vouchers match these filters.
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Create one from an issued passenger ticket when a cancellation still needs an airline
              claim or reuse.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {items.map((voucher) => (
              <VoucherCard
                key={voucher.id}
                voucher={voucher}
                expanded={expandedVoucherId === voucher.id}
                canManage={canManageLifecycle}
                onToggle={() =>
                  setExpandedVoucherId((current) => (current === voucher.id ? '' : voucher.id))
                }
                onUpdated={async () => {
                  await requestVouchers(appliedFilters)
                }}
              />
            ))}
          </div>
        )}

        {nextCursor && (
          <button
            type="button"
            disabled={isLoadingMore}
            onClick={() =>
              void requestVouchers(appliedFilters, { cursor: nextCursor, append: true })
            }
            className="ui-tap ui-focus mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-700 disabled:opacity-50"
          >
            {isLoadingMore ? (
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserRound className="h-4 w-4" aria-hidden="true" />
            )}
            Load more
          </button>
        )}
      </section>
    </div>
  )
}
