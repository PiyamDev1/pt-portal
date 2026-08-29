'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Check, ClipboardCheck, Eraser, Save } from 'lucide-react'
import { toast } from 'sonner'
import { createLowFareAdjustment, createLowFareCheck, LowFareApiError } from './lowFareClientApi'
import type { LowFareQueueItem, LowFareSaveResult } from './types'

const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/

function localToday() {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `low-fare-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatGbp(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value)
}

function parsePence(value: string | number) {
  const normalized = String(value)
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/)
  if (!match) return null
  const pounds = Number(match[1])
  const pennies = Number((match[2] || '').padEnd(2, '0'))
  if (!Number.isSafeInteger(pounds) || !Number.isSafeInteger(pennies)) return null
  const total = pounds * 100 + pennies
  return Number.isSafeInteger(total) ? total : null
}

export function LowFareAdjustmentForm({
  item,
  onCancel,
  onSaved,
}: {
  item: LowFareQueueItem
  onCancel: () => void
  onSaved: (result: LowFareSaveResult) => Promise<void>
}) {
  const minimumEffectiveDate =
    item.latestAdjustment?.effectiveDate && item.latestAdjustment.effectiveDate > item.issuedDate
      ? item.latestAdjustment.effectiveDate
      : item.issuedDate
  const [newFare, setNewFare] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(() =>
    localToday() > minimumEffectiveDate ? localToday() : minimumEffectiveDate,
  )
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSaving, setIsSaving] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())

  const currentFarePence = parsePence(item.currentSupplierFareGbp)
  const nextFarePence = parsePence(newFare)
  const differencePence =
    currentFarePence !== null && nextFarePence !== null ? currentFarePence - nextFarePence : null

  const updateDraft = (update: () => void) => {
    if (isSaving) return
    idempotencyKey.current = newIdempotencyKey()
    setErrors({})
    update()
  }

  const save = async (mode: 'adjustment' | 'check') => {
    if (isSaving) return

    const nextErrors: Record<string, string> = {}
    if (mode === 'adjustment') {
      if (!MONEY_PATTERN.test(newFare) || nextFarePence === null || nextFarePence <= 0) {
        nextErrors.newSupplierFareGbp = 'Enter a GBP fare above £0 with up to 2 decimals.'
      } else if (nextFarePence > 9_999_999_999) {
        nextErrors.newSupplierFareGbp = 'Supplier fare is above the allowed limit.'
      } else if (currentFarePence === nextFarePence) {
        nextErrors.newSupplierFareGbp = 'Use “No fare change” when the supplier fare is unchanged.'
      }
    }
    if (!effectiveDate) nextErrors.effectiveDate = 'Enter the new fare issue date.'
    else if (effectiveDate < minimumEffectiveDate) {
      nextErrors.effectiveDate = `Date cannot be before ${minimumEffectiveDate}.`
    }
    if (notes.trim().length > 1000) nextErrors.notes = 'Notes can contain at most 1,000 characters.'

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    if (mode === 'adjustment' && nextFarePence === null) return

    setIsSaving(true)
    try {
      const common = {
        bookingId: item.bookingId,
        expectedBookingVersion: item.bookingVersion,
        expectedRootTransactionVersion: item.rootTransactionVersion,
        expectedPreviousAdjustmentId: item.latestAdjustment?.adjustmentId || null,
        effectiveDate,
        notes: notes.trim() || null,
      }
      const result =
        mode === 'check'
          ? await createLowFareCheck(common, idempotencyKey.current)
          : await createLowFareAdjustment(
              {
                ...common,
                newSupplierFareGbp: (nextFarePence as number) / 100,
                currency: 'GBP',
              },
              idempotencyKey.current,
            )
      if ('differenceGbp' in result) {
        toast.success(
          Number(result.differenceGbp) > 0
            ? 'Lower supplier fare recorded'
            : 'Supplier fare increase recorded',
        )
      } else {
        toast.success('Fare checked — no change recorded')
      }
      void onSaved(result).catch(() => {
        toast.error('Fare saved, but the queue could not be refreshed. Refresh to see it.')
      })
    } catch (error) {
      if (error instanceof LowFareApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('Unable to record the fare. Your entry has been kept for retry.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void save('adjustment')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape' || isSaving) return
    event.preventDefault()
    onCancel()
  }

  return (
    <form
      aria-label={`Record supplier fare for ${item.pnr}`}
      onSubmit={submit}
      onKeyDown={onKeyDown}
      className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 shadow-inner"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-800">
            Whole-PNR supplier fare
          </p>
          <h3 className="mt-1 font-black text-slate-950">Record a new fare for {item.pnr}</h3>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-sky-200">
          Current {formatGbp((currentFarePence || 0) / 100)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(10rem,0.8fr)_minmax(10rem,0.7fr)_minmax(14rem,1.5fr)]">
        <label className="text-xs font-bold text-slate-700">
          New supplier fare (£)
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            value={newFare}
            disabled={isSaving}
            onChange={(event) => updateDraft(() => setNewFare(event.target.value))}
            aria-label={`New supplier fare for ${item.pnr}`}
            aria-invalid={Boolean(errors.newSupplierFareGbp)}
            aria-describedby={
              errors.newSupplierFareGbp ? `low-fare-amount-error-${item.bookingId}` : undefined
            }
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold text-slate-950 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
            placeholder="0.00"
          />
          {errors.newSupplierFareGbp && (
            <span
              id={`low-fare-amount-error-${item.bookingId}`}
              className="mt-1 block text-xs font-semibold text-red-700"
            >
              {errors.newSupplierFareGbp}
            </span>
          )}
        </label>

        <label className="text-xs font-bold text-slate-700">
          New fare issue date
          <input
            type="date"
            min={minimumEffectiveDate}
            value={effectiveDate}
            disabled={isSaving}
            onChange={(event) => updateDraft(() => setEffectiveDate(event.target.value))}
            aria-invalid={Boolean(errors.effectiveDate)}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
          />
          {errors.effectiveDate && (
            <span className="mt-1 block text-xs font-semibold text-red-700">
              {errors.effectiveDate}
            </span>
          )}
        </label>

        <label className="text-xs font-bold text-slate-700">
          Notes (optional)
          <input
            value={notes}
            maxLength={1000}
            disabled={isSaving}
            onChange={(event) => updateDraft(() => setNotes(event.target.value))}
            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100 disabled:opacity-60"
            placeholder="Supplier or issue reference"
          />
          {errors.notes && (
            <span className="mt-1 block text-xs font-semibold text-red-700">{errors.notes}</span>
          )}
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-sky-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div aria-live="polite" className="min-h-6 text-sm font-black">
          {differencePence !== null && differencePence !== 0 ? (
            <span className={differencePence > 0 ? 'text-emerald-800' : 'text-amber-800'}>
              {differencePence > 0 ? '+' : '-'}
              {formatGbp(Math.abs(differencePence) / 100)}{' '}
              {differencePence > 0 ? 'lower fare' : 'fare increase'}
            </span>
          ) : (
            <span className="text-slate-500">Enter the replacement whole-PNR fare.</span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Eraser className="h-4 w-4" aria-hidden="true" />
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save('check')}
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-black text-emerald-900 hover:bg-emerald-100 disabled:opacity-50 sm:flex-none"
          >
            <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
            No fare change
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-sky-800 px-5 text-sm font-black text-white hover:bg-sky-900 disabled:opacity-50 sm:flex-none"
          >
            {isSaving ? (
              <Save className="h-4 w-4 animate-pulse" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            {isSaving ? 'Recording…' : 'Record fare'}
          </button>
        </div>
      </div>
    </form>
  )
}
