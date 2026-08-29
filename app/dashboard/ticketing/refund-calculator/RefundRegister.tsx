'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { ChevronDown, ChevronUp, LoaderCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
  TICKET_REFUND_EVENT_TYPES,
  TICKET_REFUND_STATUSES,
  type TicketingRefundEventType,
  type TicketingRefundItem,
  type TicketingRefundStatus,
} from '@/lib/ticketing/refundContracts'
import {
  appendTicketRefundEvent,
  loadTicketRefunds,
  RefundCalculatorLookupError,
} from './refundCalculatorClientApi'

const STATUS_LABELS: Record<TicketingRefundStatus, string> = {
  recorded: 'Recorded',
  part_settled: 'Part settled',
  recovery_pending: 'Recovery pending',
  settled: 'Settled',
  closed: 'Closed',
  voided: 'Voided',
}
const EVENT_LABELS: Record<TicketingRefundEventType, string> = {
  customer_settlement: 'Customer refund / credit settled',
  airline_recovery: 'Airline recovery received',
  other_cost: 'Additional cost paid',
  recovery_finalised: 'Airline recovery finalised',
  closed: 'Close record',
  voided: 'Void erroneous record',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function key() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `refund-event-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function gbp(value: string | number | null) {
  if (value === null) return 'Pending'
  const amount = Number(value)
  return Number.isFinite(amount) ? `£${amount.toFixed(2)}` : 'Unavailable'
}

function RefundEventForm({
  refund,
  onUpdated,
}: {
  refund: TicketingRefundItem
  onUpdated: () => Promise<void>
}) {
  const [eventType, setEventType] = useState<TicketingRefundEventType>('customer_settlement')
  const [amount, setAmount] = useState('')
  const [eventDate, setEventDate] = useState(today())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    const acceptsAmount = ['customer_settlement', 'airline_recovery', 'other_cost'].includes(
      eventType,
    )
    const parsedAmount = amount.trim() ? Number(amount) : null
    if (acceptsAmount && (!parsedAmount || parsedAmount <= 0)) {
      setError('Enter a positive GBP amount.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await appendTicketRefundEvent(
        refund.id,
        {
          expectedVersion: refund.version,
          eventType,
          amountGbp: acceptsAmount ? parsedAmount : null,
          eventDate,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          overrideReason: reason.trim() || null,
        },
        key(),
      )
      toast.success('Refund lifecycle updated.')
      await onUpdated()
    } catch (caught) {
      setError(
        caught instanceof RefundCalculatorLookupError
          ? caught.message
          : 'Unable to update this Refund.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-3 border-t border-slate-200 pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-bold text-slate-700 sm:col-span-2">
          Settlement event
          <select
            value={eventType}
            onChange={(event) => setEventType(event.target.value as TicketingRefundEventType)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2"
          >
            {TICKET_REFUND_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {EVENT_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-700">
          Event date
          <input
            type="date"
            value={eventDate}
            max={today()}
            onChange={(event) => setEventDate(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2"
          />
        </label>
      </div>
      {['customer_settlement', 'airline_recovery', 'other_cost'].includes(eventType) && (
        <label className="block text-xs font-bold text-slate-700">
          Amount in GBP
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
          />
        </label>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-bold text-slate-700">
          Reference
          <input
            value={reference}
            maxLength={200}
            onChange={(event) => setReference(event.target.value)}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
          />
        </label>
        {['closed', 'voided'].includes(eventType) && (
          <label className="text-xs font-bold text-slate-700">
            Reason
            <input
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
            />
          </label>
        )}
      </div>
      <label className="block text-xs font-bold text-slate-700">
        Notes
        <textarea
          value={notes}
          maxLength={2000}
          rows={2}
          onChange={(event) => setNotes(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      {error && <p className="text-xs font-semibold text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-xs font-black text-white disabled:opacity-50"
      >
        {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Save settlement event
      </button>
    </form>
  )
}

export function RefundRegister() {
  const [items, setItems] = useState<TicketingRefundItem[]>([])
  const [pnr, setPnr] = useState('')
  const [status, setStatus] = useState<TicketingRefundStatus | ''>('')
  const [applied, setApplied] = useState<{ pnr: string; status: TicketingRefundStatus | '' }>({
    pnr: '',
    status: '',
  })
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [expandedId, setExpandedId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const sequence = useRef(0)

  const load = useCallback(
    async (
      filters: { pnr: string; status: TicketingRefundStatus | '' },
      options: { cursor?: string; append?: boolean } = {},
    ) => {
      const requestId = ++sequence.current
      setIsLoading(true)
      try {
        const page = await loadTicketRefunds(filters, { cursor: options.cursor })
        if (requestId !== sequence.current) return
        setItems((current) => (options.append ? [...current, ...page.items] : page.items))
        setNextCursor(page.nextCursor)
        setCanManage(page.context.canManage)
        setError('')
      } catch (caught) {
        if (requestId === sequence.current) {
          setError(
            caught instanceof RefundCalculatorLookupError
              ? caught.message
              : 'Unable to load saved Refunds.',
          )
        }
      } finally {
        if (requestId === sequence.current) setIsLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void load({ pnr: '', status: '' })
  }, [load])

  const apply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const filters = { pnr: pnr.trim().toUpperCase().replace(/\s+/g, ''), status }
    setPnr(filters.pnr)
    setApplied(filters)
    void load(filters)
  }

  return (
    <section className="space-y-4" aria-labelledby="refund-register-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
            Saved lifecycle
          </p>
          <h2 id="refund-register-title" className="mt-1 text-xl font-black text-slate-950">
            Refund register
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load(applied)}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>
      <form
        onSubmit={apply}
        className="grid gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:grid-cols-[1fr_1fr_auto]"
      >
        <label className="text-xs font-bold text-slate-700">
          PNR
          <input
            value={pnr}
            maxLength={20}
            onChange={(event) => setPnr(event.target.value.toUpperCase())}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 uppercase"
          />
        </label>
        <label className="text-xs font-bold text-slate-700">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as TicketingRefundStatus | '')}
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2"
          >
            <option value="">All statuses</option>
            {TICKET_REFUND_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-10 self-end rounded-lg bg-slate-900 px-5 text-sm font-black text-white">
          Apply
        </button>
      </form>
      {error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>
      )}
      {items.length === 0 && !isLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500">
          No saved Refunds match these filters.
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {items.map((refund) => {
            const expanded = refund.id === expandedId
            return (
              <article
                key={refund.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-base font-black text-slate-950">{refund.pnr}</p>
                    <p className="mt-1 text-xs font-bold text-slate-600">
                      {refund.airline.iataCode} · {refund.passengerName || 'Passenger'} ·{' '}
                      {refund.passengerType} · {refund.ticketNumber}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Owner: {refund.owner.fullName}</p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black uppercase text-amber-800 ring-1 ring-amber-200">
                      {STATUS_LABELS[refund.status]}
                    </span>
                    <p className="mt-2 text-[10px] font-black uppercase text-slate-500">
                      {refund.commissionScope === 'package' ? 'Package item' : 'Standard ticket'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                  <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                    <span className="text-slate-500">Customer due</span>
                    <p className="font-black">{gbp(refund.proposedCustomerRefundGbp)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                    <span className="text-slate-500">Settled</span>
                    <p className="font-black">{gbp(refund.customerSettledGbp)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                    <span className="text-slate-500">Airline recovery</span>
                    <p className="font-black">{gbp(refund.airlineRecoveredGbp)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                    <span className="text-slate-500">Actual result</span>
                    <p className="font-black">{gbp(refund.actualCompanyResultGbp)}</p>
                  </div>
                </div>
                {canManage && !['closed', 'voided'].includes(refund.status) && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? '' : refund.id)}
                    className="mt-3 inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-black text-slate-700"
                  >
                    {expanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    {expanded ? 'Hide settlement form' : 'Record settlement'}
                  </button>
                )}
                {expanded && <RefundEventForm refund={refund} onUpdated={() => load(applied)} />}
              </article>
            )
          })}
        </div>
      )}
      {isLoading && items.length === 0 && (
        <p className="flex items-center justify-center py-8 text-sm font-semibold text-slate-500">
          <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Loading saved Refunds…
        </p>
      )}
      {nextCursor && (
        <button
          type="button"
          onClick={() => void load(applied, { cursor: nextCursor, append: true })}
          disabled={isLoading}
          className="min-h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-black text-slate-700"
        >
          Load more
        </button>
      )}
    </section>
  )
}
