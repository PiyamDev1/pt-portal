'use client'

import { useRef, useState, type FormEvent } from 'react'
import { Banknote, Save } from 'lucide-react'
import { toast } from 'sonner'
import { ModalBase } from '@/components'
import { TicketLedgerApiError, updateTicketRootPaymentStatus } from './ledgerClientApi'
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
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `ticket-payment-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function TicketPaymentStatusDialog({
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
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'part_paid' | 'paid'>(
    item?.paymentStatus === 'paid' ? 'paid' : item?.paymentStatus === 'part_paid' ? 'part_paid' : 'unpaid',
  )
  const [paidAt, setPaidAt] = useState(() => todayInTimezone(timezone))
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())

  if (!item) return null

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    if (paymentStatus === 'paid' && !paidAt) {
      setError('Enter the paid date.')
      return
    }
    if (paymentStatus === 'paid' && paidAt < item.bookingDate) {
      setError('Paid date cannot be before the ticket booking date.')
      return
    }
    setError('')
    setIsSaving(true)
    try {
      await updateTicketRootPaymentStatus(
        item.bookingId,
        {
          expectedBookingVersion: item.bookingVersion,
          expectedTransactionVersion: item.transactionVersion,
          paymentStatus,
          paidAt: paymentStatus === 'paid' ? paidAt : null,
        },
        idempotencyKey.current,
      )
      toast.success(`Payment marked ${paymentStatus.replace('_', ' ')}`)
      await onSaved()
      onClose()
    } catch (caught) {
      if (caught instanceof TicketLedgerApiError && caught.code === 'VERSION_CONFLICT') {
        await onSaved().catch(() => undefined)
        setError('This ticket changed. Reopen it from the refreshed ledger and try again.')
      } else {
        setError(caught instanceof Error ? caught.message : 'Unable to update payment right now.')
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
      title="Update payment"
      description="Set the live customer payment state directly. No approval or explanation is needed."
      isLoading={isSaving}
      size="md"
      className="overflow-hidden rounded-2xl"
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="rounded-xl border border-[#ead4d8] bg-[#fff8f8] p-3">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-[#65131e]">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {item.pnr} · {item.customerName}
          </p>
          <p className="mt-1 text-xs text-[#7b4550]">
            Current status: {item.paymentStatus.replace('_', ' ')}
          </p>
        </div>

        <label className="block text-xs font-bold text-slate-700">
          Payment status
          <select
            autoFocus
            value={paymentStatus}
            onChange={(event) => {
              setPaymentStatus(event.target.value as 'unpaid' | 'part_paid' | 'paid')
              setError('')
              idempotencyKey.current = newIdempotencyKey()
            }}
            disabled={isSaving}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
          >
            <option value="unpaid">Unpaid</option>
            <option value="part_paid">Part paid</option>
            <option value="paid">Paid</option>
          </select>
        </label>

        {paymentStatus === 'paid' && (
          <label className="block text-xs font-bold text-slate-700">
            Paid date
            <input
              type="date"
              value={paidAt}
              onChange={(event) => {
                setPaidAt(event.target.value)
                setError('')
                idempotencyKey.current = newIdempotencyKey()
              }}
              disabled={isSaving}
              aria-invalid={Boolean(error)}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
            />
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 ring-1 ring-red-200">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={isSaving} className="ui-tap ui-focus min-h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white hover:bg-[#6f1422] disabled:opacity-50">
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Saving…' : 'Save payment'}
          </button>
        </div>
      </form>
    </ModalBase>
  )
}
