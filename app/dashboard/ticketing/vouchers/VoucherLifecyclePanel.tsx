'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CircleAlert, History, LoaderCircle, Search } from 'lucide-react'
import { toast } from 'sonner'
import type {
  TicketingVoucherEventItem,
  TicketingVoucherEventType,
  TicketingVoucherItem,
} from '@/lib/ticketing/voucherContracts'
import {
  loadTicketCompletionDetail,
  loadTicketLedger,
  TicketLedgerApiError,
} from '../ledger/ledgerClientApi'
import type { TicketCompletionPassenger, TicketLedgerItem } from '../ledger/types'
import {
  appendTicketVoucherEvent,
  loadTicketVoucherEvents,
  TicketVoucherApiError,
} from './voucherClientApi'

const EVENT_LABELS: Record<'created' | TicketingVoucherEventType, string> = {
  created: 'Voucher created',
  claim_submitted: 'Claim submitted',
  value_confirmed: 'Airline value confirmed',
  part_used: 'Credit used on ticket',
  used_on_new_ticket: 'Credit fully used',
  refund_received: 'Refund received',
  expired: 'Expired',
  closed: 'Closed',
  deadline_corrected: 'Claim deadline corrected',
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function key() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `voucher-event-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizedPnr(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function passengerKey(passenger: TicketCompletionPassenger) {
  return `${passenger.passengerType}:${passenger.position}`
}

function money(value: string | number | null) {
  if (value === null) return ''
  const amount = Number(value)
  return Number.isFinite(amount) ? ` · £${amount.toFixed(2)}` : ''
}

export function VoucherLifecyclePanel({
  voucher,
  canManage,
  onUpdated,
}: {
  voucher: TicketingVoucherItem
  canManage: boolean
  onUpdated: () => Promise<void>
}) {
  const [events, setEvents] = useState<TicketingVoucherEventItem[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [error, setError] = useState('')
  const [eventType, setEventType] = useState<TicketingVoucherEventType>(
    voucher.status === 'unclaimed' ? 'claim_submitted' : 'value_confirmed',
  )
  const [amount, setAmount] = useState('')
  const [eventDate, setEventDate] = useState(today())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [replacementPnr, setReplacementPnr] = useState('')
  const [replacementTickets, setReplacementTickets] = useState<TicketLedgerItem[]>([])
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [passengers, setPassengers] = useState<TicketCompletionPassenger[]>([])
  const [selectedPassengerKey, setSelectedPassengerKey] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)

  const complete = ['used_on_new_ticket', 'refund_received', 'expired', 'closed'].includes(
    voucher.status,
  )
  const choices = useMemo(() => {
    if (!canManage) return voucher.status === 'unclaimed' ? ['claim_submitted'] : []
    if (voucher.status === 'unclaimed') {
      return ['claim_submitted', 'value_confirmed', 'deadline_corrected', 'closed']
    }
    if (voucher.status === 'claim_submitted') {
      return ['value_confirmed', 'deadline_corrected', 'closed']
    }
    if (['airline_credit_confirmed', 'part_used'].includes(voucher.status)) {
      return ['part_used', 'refund_received', 'deadline_corrected', 'expired', 'closed']
    }
    return []
  }, [canManage, voucher.status]) as TicketingVoucherEventType[]

  useEffect(() => {
    let active = true
    setIsLoadingHistory(true)
    loadTicketVoucherEvents(voucher.id)
      .then((items) => {
        if (active) setEvents(items)
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof TicketVoucherApiError
              ? caught.message
              : 'Unable to load Ticket Voucher history.',
          )
        }
      })
      .finally(() => {
        if (active) setIsLoadingHistory(false)
      })
    return () => {
      active = false
    }
  }, [voucher.id, voucher.version])

  useEffect(() => {
    if (choices.length > 0 && !choices.includes(eventType)) setEventType(choices[0])
  }, [choices, eventType])

  const selectedPassenger =
    passengers.find((passenger) => passengerKey(passenger) === selectedPassengerKey) || null

  const selectBooking = async (bookingId: string) => {
    setSelectedBookingId(bookingId)
    setPassengers([])
    setSelectedPassengerKey('')
    if (!bookingId) return
    setIsLookingUp(true)
    try {
      const result = await loadTicketCompletionDetail(bookingId)
      const eligible = result.detail.passengers.filter((passenger) =>
        Boolean(passenger.ticketNumber),
      )
      setPassengers(eligible)
      if (eligible.length === 1) setSelectedPassengerKey(passengerKey(eligible[0]))
    } catch (caught) {
      setError(
        caught instanceof TicketLedgerApiError
          ? caught.message
          : 'Unable to load replacement passengers.',
      )
    } finally {
      setIsLookingUp(false)
    }
  }

  const lookupReplacement = async () => {
    const pnr = normalizedPnr(replacementPnr)
    if (!pnr) return setError('Enter the exact replacement PNR.')
    setIsLookingUp(true)
    setError('')
    try {
      const payload = await loadTicketLedger({ search: pnr })
      const matches = payload.items.filter(
        (ticket) =>
          normalizedPnr(ticket.pnr) === pnr &&
          ticket.serviceType === 'TK' &&
          ['held', 'issued'].includes(ticket.operationalStatus.toLowerCase()),
      )
      setReplacementTickets(matches)
      if (matches.length === 0) setError('No Held or Issued TK with that exact PNR is visible.')
      if (matches.length === 1) await selectBooking(matches[0].bookingId)
    } catch (caught) {
      setError(
        caught instanceof TicketLedgerApiError ? caught.message : 'Unable to find that ticket.',
      )
    } finally {
      setIsLookingUp(false)
    }
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    const requiresAmount = ['value_confirmed', 'part_used', 'refund_received'].includes(eventType)
    const parsedAmount = amount.trim() ? Number(amount) : null
    if (requiresAmount && (!parsedAmount || parsedAmount <= 0)) {
      setError('Enter a positive GBP amount.')
      return
    }
    if (eventType === 'part_used' && (!selectedBookingId || !selectedPassenger)) {
      setError('Select the exact replacement passenger ticket.')
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await appendTicketVoucherEvent(
        voucher.id,
        {
          expectedVersion: voucher.version,
          eventType,
          amountGbp: requiresAmount ? parsedAmount : null,
          eventDate,
          linkedBookingId: eventType === 'part_used' ? selectedBookingId : null,
          linkedPassengerType:
            eventType === 'part_used' ? selectedPassenger?.passengerType || null : null,
          linkedPassengerPosition:
            eventType === 'part_used' ? selectedPassenger?.position || null : null,
          refundId: null,
          airlineReference: reference.trim() || null,
          notes: notes.trim() || null,
          reason: reason.trim() || null,
        },
        key(),
      )
      toast.success('Ticket Voucher updated.')
      await onUpdated()
    } catch (caught) {
      setError(
        caught instanceof TicketVoucherApiError
          ? caught.message
          : 'Unable to update this Ticket Voucher.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="mt-4 space-y-4 border-t border-slate-200 pt-4">
      <div>
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-600">
          <History className="h-4 w-4" aria-hidden="true" /> Lifecycle history
        </p>
        {isLoadingHistory ? (
          <p className="mt-2 text-xs font-semibold text-slate-500">Loading history…</p>
        ) : (
          <ol className="mt-2 space-y-1 text-xs text-slate-600">
            {events.map((item) => (
              <li key={item.id}>
                <strong className="text-slate-800">{EVENT_LABELS[item.eventType]}</strong>
                {money(item.amountGbp)} · {item.eventDate} · {item.actor.fullName}
              </li>
            ))}
          </ol>
        )}
      </div>

      {!complete && choices.length > 0 && (
        <form
          onSubmit={save}
          className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Next action
              <select
                value={eventType}
                onChange={(event) => setEventType(event.target.value as TicketingVoucherEventType)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2"
              >
                {choices.map((choice) => (
                  <option key={choice} value={choice}>
                    {EVENT_LABELS[choice]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-700">
              {eventType === 'deadline_corrected' ? 'Corrected claim deadline' : 'Event date'}
              <input
                type="date"
                value={eventDate}
                max={eventType === 'deadline_corrected' ? undefined : today()}
                onChange={(event) => setEventDate(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2"
              />
            </label>
          </div>

          {['value_confirmed', 'part_used', 'refund_received'].includes(eventType) && (
            <label className="block text-xs font-bold text-slate-700">
              Amount in GBP
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
              />
            </label>
          )}

          {eventType === 'part_used' && (
            <div className="space-y-2 rounded-lg bg-white p-3 ring-1 ring-slate-200">
              <p className="text-xs font-black text-slate-800">
                Same-airline replacement passenger ticket
              </p>
              <div className="flex gap-2">
                <input
                  value={replacementPnr}
                  onChange={(event) => setReplacementPnr(event.target.value.toUpperCase())}
                  placeholder="Exact replacement PNR"
                  className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-xs font-bold uppercase"
                />
                <button
                  type="button"
                  onClick={() => void lookupReplacement()}
                  disabled={isLookingUp}
                  className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-slate-900 px-3 text-xs font-black text-white"
                >
                  <Search className="h-3.5 w-3.5" aria-hidden="true" /> Find
                </button>
              </div>
              {replacementTickets.length > 0 && (
                <select
                  value={selectedBookingId}
                  onChange={(event) => void selectBooking(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">Select ticket</option>
                  {replacementTickets.map((ticket) => (
                    <option key={ticket.bookingId} value={ticket.bookingId}>
                      {ticket.pnr} · {ticket.airline.iataCode} · {ticket.customerName}
                    </option>
                  ))}
                </select>
              )}
              {passengers.length > 0 && (
                <select
                  value={selectedPassengerKey}
                  onChange={(event) => setSelectedPassengerKey(event.target.value)}
                  className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-xs"
                >
                  <option value="">Select passenger ticket</option>
                  {passengers.map((passenger) => (
                    <option key={passengerKey(passenger)} value={passengerKey(passenger)}>
                      {passenger.passengerType} #{passenger.position} · {passenger.fullName} ·{' '}
                      {passenger.ticketNumber}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Airline reference
              <input
                value={reference}
                maxLength={120}
                onChange={(event) => setReference(event.target.value)}
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3"
              />
            </label>
            {['closed', 'deadline_corrected'].includes(eventType) && (
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
          {error && (
            <p role="alert" className="flex items-start gap-1 text-xs font-semibold text-red-700">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-xs font-black text-white disabled:opacity-50"
          >
            {isSaving && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save lifecycle event
          </button>
        </form>
      )}

      {error && (complete || choices.length === 0) && (
        <p role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </div>
  )
}
