'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Banknote, Save } from 'lucide-react'
import { toast } from 'sonner'
import { ModalBase } from '@/components'
import { markTicketServicePaid, TicketLedgerApiError } from './ledgerClientApi'
import type { TicketLedgerItem } from './types'

function todayInTimezone(timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    return `${value.year}-${value.month}-${value.day}`
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ticket-service-paid-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function TicketServicePaymentDialog({
  item,
  timezone,
  onClose,
  onSaved,
}: {
  item: TicketLedgerItem | null
  timezone: string
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [paidAt, setPaidAt] = useState(() => todayInTimezone(timezone))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())

  if (!item) return null

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    if (!paidAt) {
      setError('Enter the paid date.')
      return
    }
    if (paidAt < item.bookingDate) {
      setError('Paid date cannot be before the service booking date.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await markTicketServicePaid(
        item.bookingId,
        item.transactionId,
        {
          expectedBookingVersion: item.bookingVersion,
          expectedTransactionVersion: item.transactionVersion,
          paidAt,
        },
        idempotencyKey.current,
      )
      toast.success(`${item.serviceType} marked as paid`)
      await onSaved()
      onClose()
    } catch (caught) {
      if (caught instanceof TicketLedgerApiError && caught.code === 'VERSION_CONFLICT') {
        try {
          await onSaved()
          toast.error('This service changed. Reopen it from the refreshed ledger and review again.')
          onClose()
        } catch {
          setError('This service changed. Close this window, refresh the ledger, and review again.')
          toast.error('This service changed and the ledger could not be refreshed.')
        }
      } else {
        setError(
          caught instanceof TicketLedgerApiError
            ? caught.message
            : 'Unable to mark this service as paid right now.',
        )
        toast.error(caught instanceof Error ? caught.message : 'Unable to update payment')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalBase
      isOpen
      onClose={onClose}
      title="Mark service as paid"
      description="Record the date the customer payment was completed for this issued service."
      isLoading={isSaving}
      size="md"
      className="overflow-hidden rounded-2xl"
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[#8b1e2d]">
          {item.serviceType} · {item.pnr}
        </p>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-emerald-900">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {item.customerName}
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            Service booked {item.bookingDate} · {item.passengerCount} affected ticket(s)
          </p>
        </div>

        <label className="text-xs font-bold text-slate-700">
          Paid date
          <input
            autoFocus
            type="date"
            value={paidAt}
            onChange={(event) => {
              setPaidAt(event.target.value)
              setError('')
              idempotencyKey.current = newIdempotencyKey()
            }}
            disabled={isSaving}
            aria-label="Paid date for service"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'service-payment-error' : undefined}
            className={`mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 ${
              error
                ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                : 'border-slate-300 focus:border-[#8b1e2d] focus:ring-red-100'
            }`}
          />
        </label>

        {error && (
          <p
            id="service-payment-error"
            role="alert"
            className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 ring-1 ring-red-200"
          >
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Keep unpaid
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white hover:bg-[#6f1422] disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Saving…' : 'Mark paid'}
          </button>
        </div>
      </form>
    </ModalBase>
  )
}
