'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { CheckCircle2, Eraser, Link2, Save, Search } from 'lucide-react'
import { toast } from 'sonner'
import {
  createTicketServiceTransaction,
  lookupIssuedTicketBookings,
  TicketLedgerApiError,
} from './ledgerClientApi'
import type {
  CreateTicketServiceInput,
  TicketPassengerType,
  TicketServiceBookingOption,
} from './types'

const PASSENGER_TYPES: TicketPassengerType[] = ['ADT', 'CHD', 'INF']
const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/

type ServiceType = 'DC' | 'R-ER'
type FareDraft = Partial<
  Record<TicketPassengerType, { quantity: string; unitSupplierCost: string; unitSalePrice: string }>
>
type EntryErrors = Record<string, string>

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
  return `ticket-service-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function normalizePnr(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function bookingPassengerMix(booking: TicketServiceBookingOption) {
  return booking.fares.map((fare) => `${fare.quantity} ${fare.passengerType}`).join(' · ')
}

function bookingJourney(booking: TicketServiceBookingOption) {
  if (!booking.departureDate) return 'Journey not recorded'
  return booking.returnDate
    ? `${booking.departureDate} → ${booking.returnDate}`
    : `${booking.departureDate} · One way`
}

function bookingReference(booking: TicketServiceBookingOption) {
  return booking.bookingId.slice(-8).toUpperCase()
}

function mergeBookingMatches(
  current: TicketServiceBookingOption[],
  incoming: TicketServiceBookingOption[],
) {
  const byId = new Map(current.map((booking) => [booking.bookingId, booking]))
  for (const booking of incoming) byId.set(booking.bookingId, booking)
  return [...byId.values()]
}

function fieldClass(hasError: boolean) {
  return `mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${
    hasError
      ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
      : 'border-slate-300 focus:border-[#8b1e2d] focus:ring-red-100'
  }`
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="mt-1 text-xs font-semibold text-red-700">
      {message}
    </p>
  )
}

function initialFares(booking: TicketServiceBookingOption, retained: FareDraft = {}): FareDraft {
  return Object.fromEntries(
    booking.fares.map((fare) => {
      const previous = retained[fare.passengerType]
      const retainedQuantity = Number(previous?.quantity)
      return [
        fare.passengerType,
        {
          quantity:
            previous && Number.isInteger(retainedQuantity)
              ? String(Math.min(Math.max(retainedQuantity, 0), fare.quantity))
              : String(fare.quantity),
          unitSupplierCost: previous?.unitSupplierCost || '',
          unitSalePrice: previous?.unitSalePrice || '',
        },
      ]
    }),
  ) as FareDraft
}

export function TicketFollowOnEntryForm({
  serviceType,
  timezone,
  onCreated,
}: {
  serviceType: ServiceType
  timezone: string
  onCreated: () => Promise<void>
}) {
  const today = todayInTimezone(timezone)
  const [pnr, setPnr] = useState('')
  const [matches, setMatches] = useState<TicketServiceBookingOption[]>([])
  const [hasMoreMatches, setHasMoreMatches] = useState(false)
  const [nextLookupCursor, setNextLookupCursor] = useState<string | null>(null)
  const [selected, setSelected] = useState<TicketServiceBookingOption | null>(null)
  const [bookingDate, setBookingDate] = useState(today)
  const [issuedAt, setIssuedAt] = useState(today)
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid')
  const [paidAt, setPaidAt] = useState(today)
  const [fares, setFares] = useState<FareDraft>({})
  const [errors, setErrors] = useState<EntryErrors>({})
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const pnrInput = useRef<HTMLInputElement>(null)
  const lookupAbort = useRef<AbortController | null>(null)
  const idempotencyKey = useRef(newIdempotencyKey())

  useEffect(() => () => lookupAbort.current?.abort(), [])

  const serviceLabel = serviceType === 'DC' ? 'date change' : 'reissue'

  const selectBooking = (booking: TicketServiceBookingOption, retained: FareDraft = {}) => {
    setSelected(booking)
    setFares(initialFares(booking, retained))
    setErrors({})
    idempotencyKey.current = newIdempotencyKey()
  }

  const reset = () => {
    lookupAbort.current?.abort()
    setPnr('')
    setMatches([])
    setHasMoreMatches(false)
    setNextLookupCursor(null)
    setSelected(null)
    setBookingDate(todayInTimezone(timezone))
    setIssuedAt(todayInTimezone(timezone))
    setPaymentStatus('unpaid')
    setPaidAt(todayInTimezone(timezone))
    setFares({})
    setErrors({})
    idempotencyKey.current = newIdempotencyKey()
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => pnrInput.current?.focus())
    } else {
      pnrInput.current?.focus()
    }
  }

  const lookup = async () => {
    const normalizedPnr = normalizePnr(pnr)
    if (!normalizedPnr) {
      setErrors({ pnr: 'Enter the existing ticket PNR.' })
      pnrInput.current?.focus()
      return
    }

    lookupAbort.current?.abort()
    const controller = new AbortController()
    lookupAbort.current = controller
    setIsLookingUp(true)
    setErrors({})
    setSelected(null)
    setMatches([])
    setHasMoreMatches(false)
    setNextLookupCursor(null)
    setFares({})
    idempotencyKey.current = newIdempotencyKey()

    try {
      const result = await lookupIssuedTicketBookings(normalizedPnr, controller.signal)
      setPnr(normalizedPnr)
      setMatches(result.items)
      setHasMoreMatches(result.hasMore)
      setNextLookupCursor(result.nextCursor)
      if (!result.hasMore && result.items.length === 1) selectBooking(result.items[0])
      else if (!result.hasMore && result.items.length === 0) {
        setErrors({ pnr: 'No issued ticket with that PNR was found in your ledger.' })
      }
    } catch (error) {
      if (controller.signal.aborted) return
      setErrors({
        pnr:
          error instanceof TicketLedgerApiError
            ? error.message
            : 'Unable to look up that PNR right now.',
      })
    } finally {
      if (lookupAbort.current === controller) setIsLookingUp(false)
    }
  }

  const loadMoreMatches = async () => {
    if (!nextLookupCursor || isLookingUp || isSaving) return

    lookupAbort.current?.abort()
    const controller = new AbortController()
    lookupAbort.current = controller
    setIsLookingUp(true)
    setErrors({})

    try {
      const result = await lookupIssuedTicketBookings(
        normalizePnr(pnr),
        controller.signal,
        nextLookupCursor,
      )
      setMatches((current) => mergeBookingMatches(current, result.items))
      setHasMoreMatches(result.hasMore)
      setNextLookupCursor(result.nextCursor)
    } catch (error) {
      if (controller.signal.aborted) return
      setErrors({
        form:
          error instanceof TicketLedgerApiError
            ? error.message
            : 'Unable to load more matching tickets right now.',
      })
    } finally {
      if (lookupAbort.current === controller) setIsLookingUp(false)
    }
  }

  const validate = (): { input?: CreateTicketServiceInput; errors: EntryErrors } => {
    const nextErrors: EntryErrors = {}
    if (!selected) nextErrors.pnr = 'Find and select the original issued ticket first.'
    if (!bookingDate) nextErrors.bookingDate = 'Enter the service booking date.'
    if (!issuedAt) nextErrors.issuedAt = 'Enter the issued date.'
    else if (bookingDate && issuedAt < bookingDate) {
      nextErrors.issuedAt = 'Issued date cannot be before the service booking date.'
    }
    if (paymentStatus === 'paid' && !paidAt) {
      nextErrors.paidAt = 'A paid service requires a paid date.'
    } else if (paymentStatus === 'paid' && bookingDate && paidAt < bookingDate) {
      nextErrors.paidAt = 'Paid date cannot be before the service booking date.'
    }

    const affectedFares = (selected?.fares || []).flatMap((sourceFare) => {
      const draft = fares[sourceFare.passengerType]
      const quantity = Number(draft?.quantity)
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > sourceFare.quantity) {
        nextErrors[`fare.${sourceFare.passengerType}.quantity`] =
          `Use a whole number from 0 to ${sourceFare.quantity}.`
        return []
      }
      if (quantity === 0) return []

      if (!MONEY_PATTERN.test(draft?.unitSupplierCost || '')) {
        nextErrors[`fare.${sourceFare.passengerType}.unitSupplierCost`] =
          'Enter the unit service cost.'
      }
      if (!MONEY_PATTERN.test(draft?.unitSalePrice || '')) {
        nextErrors[`fare.${sourceFare.passengerType}.unitSalePrice`] =
          'Enter the unit customer charge.'
      }
      const unitSupplierCost = Number(draft?.unitSupplierCost)
      const unitSalePrice = Number(draft?.unitSalePrice)
      if (unitSupplierCost > 99_999_999.99) {
        nextErrors[`fare.${sourceFare.passengerType}.unitSupplierCost`] =
          'Service cost is above the allowed limit.'
      }
      if (unitSalePrice > 99_999_999.99) {
        nextErrors[`fare.${sourceFare.passengerType}.unitSalePrice`] =
          'Customer charge is above the allowed limit.'
      }
      if (
        nextErrors[`fare.${sourceFare.passengerType}.unitSupplierCost`] ||
        nextErrors[`fare.${sourceFare.passengerType}.unitSalePrice`]
      ) {
        return []
      }
      return [
        {
          passengerType: sourceFare.passengerType,
          quantity,
          unitSupplierCost,
          unitSalePrice,
        },
      ]
    })

    if (
      selected &&
      affectedFares.length === 0 &&
      !Object.keys(nextErrors).some((key) => key.startsWith('fare.'))
    ) {
      nextErrors.fares = 'Select at least one affected passenger.'
    }
    if (Object.keys(nextErrors).length > 0 || !selected) return { errors: nextErrors }

    return {
      errors: {},
      input: {
        expectedBookingVersion: selected.bookingVersion,
        expectedRootTransactionVersion: selected.rootTransactionVersion,
        serviceType,
        bookingDate,
        issuedAt,
        paymentStatus,
        paidAt: paymentStatus === 'paid' ? paidAt : null,
        currency: 'GBP',
        fares: affectedFares,
      },
    }
  }

  const refreshAfterConflict = async (retainedFares: FareDraft) => {
    let cursor: string | undefined
    let refreshedMatches: TicketServiceBookingOption[] = []
    const seenCursors = new Set<string>()

    while (true) {
      const result = await lookupIssuedTicketBookings(normalizePnr(pnr), undefined, cursor)
      refreshedMatches = mergeBookingMatches(refreshedMatches, result.items)
      const sameBooking = refreshedMatches.find(
        (booking) => booking.bookingId === selected?.bookingId,
      )
      if (sameBooking) {
        setMatches(refreshedMatches)
        setHasMoreMatches(result.hasMore)
        setNextLookupCursor(result.nextCursor)
        selectBooking(sameBooking, retainedFares)
        return
      }
      if (!result.hasMore || !result.nextCursor) break
      if (seenCursors.has(result.nextCursor)) {
        throw new Error('Ticket lookup cursor did not advance')
      }
      seenCursors.add(result.nextCursor)
      cursor = result.nextCursor
    }

    setMatches(refreshedMatches)
    setHasMoreMatches(false)
    setNextLookupCursor(null)
    setSelected(null)
    setFares({})
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving || isLookingUp) return
    if (!selected) {
      await lookup()
      return
    }

    const result = validate()
    setErrors(result.errors)
    if (!result.input) return

    setIsSaving(true)
    try {
      await createTicketServiceTransaction(selected.bookingId, result.input, idempotencyKey.current)
      toast.success(`${serviceType} ${serviceLabel} saved to your ledger`)
      reset()
      await onCreated()
    } catch (error) {
      if (error instanceof TicketLedgerApiError && error.code === 'VERSION_CONFLICT') {
        try {
          await refreshAfterConflict(fares)
          setErrors({
            form: 'The original ticket changed. Review the refreshed details and save again.',
          })
        } catch {
          setErrors({
            form: 'The original ticket changed and could not be refreshed. Look up the PNR again.',
          })
        }
      } else {
        setErrors({
          form:
            error instanceof TicketLedgerApiError
              ? error.message
              : `Unable to save the ${serviceLabel}. Your entry has been kept for retry.`,
        })
      }
      toast.error(error instanceof Error ? error.message : `Unable to save the ${serviceLabel}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === 'Escape' && !isSaving) {
      event.preventDefault()
      reset()
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      onKeyDown={handleKeyDown}
      aria-label={`New ${serviceType} service`}
      className="overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm"
    >
      <div className="flex flex-col gap-3 border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-800">
            Existing ticket service
          </p>
          <h2 className="mt-1 text-lg font-black text-slate-950">
            New {serviceType} {serviceLabel}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Find your issued PNR, record affected passengers and enter the service charges.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wide">
          <span className="rounded-full bg-violet-700 px-2.5 py-1 text-white">{serviceType}</span>
          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">GBP</span>
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800 ring-1 ring-sky-200">
            Issued only
          </span>
        </div>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="text-xs font-bold text-slate-700">
            Existing ticket PNR
            <input
              ref={pnrInput}
              autoFocus
              value={pnr}
              onChange={(event) => {
                setPnr(event.target.value.toUpperCase().replace(/\s+/g, ''))
                setSelected(null)
                setMatches([])
                setHasMoreMatches(false)
                setNextLookupCursor(null)
                setFares({})
                setErrors({})
                idempotencyKey.current = newIdempotencyKey()
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                void lookup()
              }}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              disabled={isLookingUp || isSaving}
              aria-label="Existing ticket PNR"
              aria-invalid={Boolean(errors.pnr)}
              aria-describedby={errors.pnr ? 'follow-on-pnr-error' : undefined}
              className={`${fieldClass(Boolean(errors.pnr))} font-mono font-bold uppercase`}
              placeholder="ABC123"
            />
            <FieldError id="follow-on-pnr-error" message={errors.pnr} />
          </label>
          <button
            type="button"
            onClick={() => void lookup()}
            disabled={isLookingUp || isSaving}
            className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 text-sm font-black text-violet-800 hover:bg-violet-100 disabled:opacity-50"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            {isLookingUp ? 'Finding…' : 'Find PNR'}
          </button>
        </div>

        {(matches.length > 1 || hasMoreMatches) && !selected && (
          <fieldset className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
            <legend className="px-1 text-xs font-black uppercase tracking-wide text-violet-800">
              Choose the original ticket
            </legend>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              {matches.map((booking) => (
                <label
                  key={booking.bookingId}
                  className="flex cursor-pointer items-start gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-violet-100"
                >
                  <input
                    type="radio"
                    name="follow-on-booking"
                    value={booking.bookingId}
                    onChange={() => selectBooking(booking)}
                    disabled={isLookingUp || isSaving}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-black text-slate-900">
                      {booking.airline.iataCode} · {booking.customerName}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {bookingJourney(booking)}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {bookingPassengerMix(booking)} · Root booked {booking.rootBookingDate}
                    </span>
                    <span className="mt-0.5 block font-mono text-[10px] font-bold text-slate-400">
                      PNR {booking.pnr} · Record {bookingReference(booking)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {hasMoreMatches && nextLookupCursor && (
              <div className="mt-3 flex flex-col gap-2 border-t border-violet-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p
                  className="text-xs font-semibold text-violet-800"
                  role="status"
                  aria-live="polite"
                >
                  Showing {matches.length} matches. More issued tickets use this PNR.
                </p>
                <button
                  type="button"
                  onClick={() => void loadMoreMatches()}
                  disabled={isLookingUp || isSaving}
                  className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-4 text-xs font-black text-violet-800 hover:bg-violet-100 disabled:opacity-50"
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  {isLookingUp ? 'Loading…' : 'Load more matches'}
                </button>
              </div>
            )}
          </fieldset>
        )}

        {selected && (
          <>
            <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Original ticket
                </p>
                <p className="mt-1 font-mono text-base font-black text-slate-950">{selected.pnr}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Customer
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">{selected.customerName}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Airline
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {selected.airline.iataCode} · {selected.airline.name}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Journey
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">{bookingJourney(selected)}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Passenger mix
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  {bookingPassengerMix(selected)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                  Verified root
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900">
                  <Link2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                  Root TK verified
                </p>
                <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-500">
                  Booked {selected.rootBookingDate} · Record {bookingReference(selected)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-xs font-bold text-slate-700">
                Service booking date
                <input
                  type="date"
                  value={bookingDate}
                  onChange={(event) => {
                    setBookingDate(event.target.value)
                    setErrors({})
                    idempotencyKey.current = newIdempotencyKey()
                  }}
                  disabled={isSaving}
                  aria-label="Service booking date"
                  aria-invalid={Boolean(errors.bookingDate)}
                  aria-describedby={errors.bookingDate ? 'follow-on-booking-date-error' : undefined}
                  className={fieldClass(Boolean(errors.bookingDate))}
                />
                <FieldError id="follow-on-booking-date-error" message={errors.bookingDate} />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Issued date
                <input
                  type="date"
                  value={issuedAt}
                  onChange={(event) => {
                    setIssuedAt(event.target.value)
                    setErrors({})
                    idempotencyKey.current = newIdempotencyKey()
                  }}
                  disabled={isSaving}
                  aria-label="Service issued date"
                  aria-invalid={Boolean(errors.issuedAt)}
                  aria-describedby={errors.issuedAt ? 'follow-on-issued-error' : undefined}
                  className={fieldClass(Boolean(errors.issuedAt))}
                />
                <FieldError id="follow-on-issued-error" message={errors.issuedAt} />
              </label>
              <label className="text-xs font-bold text-slate-700">
                Payment
                <select
                  value={paymentStatus}
                  onChange={(event) => {
                    setPaymentStatus(event.target.value as 'unpaid' | 'paid')
                    setErrors({})
                    idempotencyKey.current = newIdempotencyKey()
                  }}
                  disabled={isSaving}
                  aria-label="Service payment status"
                  className={fieldClass(false)}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              {paymentStatus === 'paid' && (
                <label className="text-xs font-bold text-slate-700">
                  Paid date
                  <input
                    type="date"
                    value={paidAt}
                    onChange={(event) => {
                      setPaidAt(event.target.value)
                      setErrors({})
                      idempotencyKey.current = newIdempotencyKey()
                    }}
                    disabled={isSaving}
                    aria-label="Service paid date"
                    aria-invalid={Boolean(errors.paidAt)}
                    aria-describedby={errors.paidAt ? 'follow-on-paid-error' : undefined}
                    className={fieldClass(Boolean(errors.paidAt))}
                  />
                  <FieldError id="follow-on-paid-error" message={errors.paidAt} />
                </label>
              )}
            </div>

            <fieldset aria-describedby={errors.fares ? 'follow-on-fares-error' : undefined}>
              <legend className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
                Affected passengers and unit service charges
              </legend>
              <div className="mt-2 grid gap-3 lg:grid-cols-3">
                {PASSENGER_TYPES.flatMap((passengerType) => {
                  const sourceFare = selected.fares.find(
                    (candidate) => candidate.passengerType === passengerType,
                  )
                  if (!sourceFare) return []
                  const fare = fares[passengerType] || {
                    quantity: '0',
                    unitSupplierCost: '',
                    unitSalePrice: '',
                  }
                  const disabled = Number(fare.quantity) === 0
                  const quantityError = errors[`fare.${passengerType}.quantity`]
                  const supplierError = errors[`fare.${passengerType}.unitSupplierCost`]
                  const saleError = errors[`fare.${passengerType}.unitSalePrice`]
                  const errorId = `follow-on-${passengerType.toLowerCase()}-fare-error`
                  return [
                    <div
                      key={passengerType}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-slate-900">{passengerType}</p>
                        <span className="text-[10px] font-bold text-slate-500">
                          Original: {sourceFare.quantity}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        <label className="text-[11px] font-bold text-slate-600">
                          Affected
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={sourceFare.quantity}
                            step={1}
                            value={fare.quantity}
                            disabled={isSaving}
                            onChange={(event) => {
                              setFares((current) => ({
                                ...current,
                                [passengerType]: {
                                  ...fare,
                                  quantity: event.target.value,
                                },
                              }))
                              setErrors({})
                              idempotencyKey.current = newIdempotencyKey()
                            }}
                            aria-label={`${passengerType} affected quantity`}
                            aria-invalid={Boolean(quantityError)}
                            aria-describedby={quantityError ? errorId : undefined}
                            className={fieldClass(Boolean(quantityError))}
                          />
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                          Unit cost (£)
                          <input
                            type="text"
                            inputMode="decimal"
                            value={fare.unitSupplierCost}
                            disabled={disabled || isSaving}
                            onChange={(event) => {
                              setFares((current) => ({
                                ...current,
                                [passengerType]: {
                                  ...fare,
                                  unitSupplierCost: event.target.value,
                                },
                              }))
                              setErrors({})
                              idempotencyKey.current = newIdempotencyKey()
                            }}
                            aria-label={`${passengerType} unit service cost`}
                            aria-invalid={Boolean(supplierError)}
                            aria-describedby={supplierError ? errorId : undefined}
                            className={`${fieldClass(Boolean(supplierError))} disabled:bg-slate-100 disabled:text-slate-400`}
                            placeholder={disabled ? 'Not affected' : '0.00'}
                          />
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                          Unit charge (£)
                          <input
                            type="text"
                            inputMode="decimal"
                            value={fare.unitSalePrice}
                            disabled={disabled || isSaving}
                            onChange={(event) => {
                              setFares((current) => ({
                                ...current,
                                [passengerType]: {
                                  ...fare,
                                  unitSalePrice: event.target.value,
                                },
                              }))
                              setErrors({})
                              idempotencyKey.current = newIdempotencyKey()
                            }}
                            aria-label={`${passengerType} unit customer charge`}
                            aria-invalid={Boolean(saleError)}
                            aria-describedby={saleError ? errorId : undefined}
                            className={`${fieldClass(Boolean(saleError))} disabled:bg-slate-100 disabled:text-slate-400`}
                            placeholder={disabled ? 'Not affected' : '0.00'}
                          />
                        </label>
                      </div>
                      {(quantityError || supplierError || saleError) && (
                        <div
                          id={errorId}
                          className="mt-2 space-y-1 text-xs font-semibold text-red-700"
                        >
                          {quantityError && <p>{quantityError}</p>}
                          {supplierError && <p>{supplierError}</p>}
                          {saleError && <p>{saleError}</p>}
                        </div>
                      )}
                    </div>,
                  ]
                })}
              </div>
              <FieldError id="follow-on-fares-error" message={errors.fares} />
            </fieldset>
          </>
        )}

        {errors.form && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 ring-1 ring-red-200"
          >
            {errors.form}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Agent, original ticket, branch and package scope are applied automatically.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={isSaving}
              className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Eraser className="h-4 w-4" aria-hidden="true" />
              Clear
            </button>
            <button
              type="submit"
              disabled={isSaving || isLookingUp || !selected}
              className="ui-tap ui-focus inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 text-sm font-black text-white shadow-sm hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {isSaving ? 'Saving…' : selected ? `Save ${serviceType}` : 'Select a ticket first'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
