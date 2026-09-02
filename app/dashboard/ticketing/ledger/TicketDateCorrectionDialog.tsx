'use client'

import { useRef, useState, type FormEvent } from 'react'
import { CalendarClock, Save } from 'lucide-react'
import { toast } from 'sonner'
import { ModalBase } from '@/components'
import { correctTicketDates, TicketLedgerApiError } from './ledgerClientApi'
import type { TicketLedgerItem } from './types'

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ticket-date-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function dateParts(value: string, timezone: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function localDateTime(value: string | null, timezone: string) {
  if (!value) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

function fieldClass(hasError: boolean) {
  return `mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-[#8b1e2d] focus:ring-red-100'
  }`
}

export function TicketDateCorrectionDialog({
  item,
  onClose,
  onSaved,
}: {
  item: TicketLedgerItem
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const isHeld =
    item.operationalStatus === 'held' ||
    (item.operationalStatus === 'cancelled' && item.issuedAt === null)
  const timezone = item.locationTimezone
  const currentIssuedDate = item.issuedAt ? dateParts(item.issuedAt, timezone) : ''
  const currentTimeLimit = localDateTime(item.timeLimitAt, timezone)
  const [bookingDate, setBookingDate] = useState(dateParts(item.bookingDate, timezone))
  const [keyDate, setKeyDate] = useState(isHeld ? currentTimeLimit : currentIssuedDate)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())

  const update = (setValue: () => void) => {
    if (isSaving) return
    setValue()
    setError('')
    idempotencyKey.current = newIdempotencyKey()
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return

    const cleanReason = reason.trim()
    if (!bookingDate || !keyDate) {
      setError(`Enter both the booking date and ${isHeld ? 'airline deadline' : 'issued date'}.`)
      return
    }
    if (keyDate.slice(0, 10) < bookingDate) {
      setError(`${isHeld ? 'Airline deadline' : 'Issued date'} cannot be before the booking date.`)
      return
    }
    if (!cleanReason) {
      setError('Enter a reason for correcting these dates.')
      return
    }
    if (cleanReason.length > 500) {
      setError('Keep the correction reason to 500 characters or fewer.')
      return
    }
    if (
      bookingDate === dateParts(item.bookingDate, timezone) &&
      keyDate === (isHeld ? currentTimeLimit : currentIssuedDate)
    ) {
      setError('Change the booking date or issued/deadline date before saving.')
      return
    }

    setIsSaving(true)
    setError('')
    try {
      await correctTicketDates(
        item.bookingId,
        {
          transactionId: item.transactionId,
          expectedBookingVersion: item.bookingVersion,
          expectedTransactionVersion: item.transactionVersion,
          operationalStatus: item.operationalStatus as
            | 'held'
            | 'issued'
            | 'cancelled'
            | 'part_refunded'
            | 'refunded',
          bookingDate,
          timeLimitAt: isHeld ? keyDate : null,
          issuedAt: isHeld ? null : keyDate,
          reason: cleanReason,
        },
        idempotencyKey.current,
      )
      await onSaved()
      toast.success(`Booking dates corrected for ${item.pnr}`)
      onClose()
    } catch (caught) {
      if (caught instanceof TicketLedgerApiError && caught.code === 'VERSION_CONFLICT') {
        try {
          await onSaved()
          toast.error('This ticket changed. Reopen the date editor from the refreshed ledger.')
          onClose()
        } catch {
          setError('This ticket changed. Close this window and refresh the ledger.')
        }
      } else {
        const message =
          caught instanceof TicketLedgerApiError
            ? caught.message
            : 'Unable to correct these ticket dates right now.'
        setError(message)
        toast.error(message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <ModalBase
      isOpen
      onClose={onClose}
      title="Correct booking dates"
      description="Update the booking date and issued date or airline deadline together."
      isLoading={isSaving}
      size="sm"
      className="overflow-hidden rounded-2xl"
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
          <p className="inline-flex items-center gap-2 text-sm font-black text-sky-950">
            <CalendarClock className="h-4 w-4" aria-hidden="true" />
            {item.pnr} · {item.customerName}
          </p>
          <p className="mt-1 text-xs font-semibold text-sky-800">
            Dates use the {timezone} branch timezone.
          </p>
        </div>

        <label className="text-xs font-bold text-slate-700">
          Booking date
          <input
            autoFocus
            type="date"
            value={bookingDate}
            onChange={(event) => update(() => setBookingDate(event.target.value))}
            disabled={isSaving}
            aria-label="Correct booking date"
            className={fieldClass(Boolean(error))}
          />
        </label>

        <label className="text-xs font-bold text-slate-700">
          {isHeld ? 'Airline deadline' : 'Issued date'}
          <input
            type={isHeld ? 'datetime-local' : 'date'}
            value={keyDate}
            onChange={(event) => update(() => setKeyDate(event.target.value))}
            disabled={isSaving}
            aria-label={isHeld ? 'Correct airline deadline' : 'Correct issued date'}
            className={fieldClass(Boolean(error))}
          />
        </label>

        <label className="text-xs font-bold text-slate-700">
          Correction reason
          <textarea
            value={reason}
            onChange={(event) => update(() => setReason(event.target.value))}
            maxLength={500}
            rows={3}
            disabled={isSaving}
            aria-label="Date correction reason"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'ticket-date-correction-error' : undefined}
            className={fieldClass(Boolean(error))}
            placeholder="Explain why these dates are being corrected"
          />
        </label>

        {error && (
          <p
            id="ticket-date-correction-error"
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
            Keep current
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white hover:bg-[#6f1422] disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {isSaving ? 'Saving…' : 'Save correction'}
          </button>
        </div>
      </form>
    </ModalBase>
  )
}
