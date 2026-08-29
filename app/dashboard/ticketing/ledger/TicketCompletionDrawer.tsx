'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Save,
  Users,
  WalletCards,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmationDialog, DrawerBase } from '@/components'
import {
  loadTicketCompletionDetail,
  TicketLedgerApiError,
  updateTicketCompletionDetail,
} from './ledgerClientApi'
import type {
  TicketCompletionDetail,
  TicketCompletionContext,
  TicketCompletionPassenger,
  TicketCompletionUpdate,
  TicketPassengerType,
} from './types'

const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/
const MONEY_MAX = 99_999_999.99

type FareSaleDraft = {
  passengerType: TicketPassengerType
  unitSalePrice: string
}

type PassengerDraft = {
  passengerType: TicketPassengerType
  position: number
  fullName: string
  contactPhone: string
  dateOfBirth: string
  ticketNumber: string
}

type CompletionDraft = {
  onBehalfReason: string
  contactPhone: string
  departureDate: string
  returnDate: string
  paymentStatus: 'unpaid' | 'part_paid' | 'paid'
  paidAt: string | null
  fareSales: FareSaleDraft[]
  passengers: PassengerDraft[]
}

type CompletionErrors = Record<string, string>

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ticket-detail-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

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

function moneyInputValue(value: string | number | null) {
  if (value === null || value === '') return ''
  return String(value)
}

function formatMoney(value: string | number | null) {
  if (value === null || value === '') return 'Not recorded'
  const amount = Number(value)
  if (!Number.isFinite(amount)) return String(value)
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount)
}

function passengerSlots(detail: TicketCompletionDetail): TicketCompletionPassenger[] {
  const existing = new Map(
    detail.passengers.map((passenger) => [
      `${passenger.passengerType}:${passenger.position}`,
      passenger,
    ]),
  )
  const slots = detail.fares.flatMap((fare) =>
    Array.from({ length: fare.quantity }, (_, index) => {
      const position = index + 1
      return (
        existing.get(`${fare.passengerType}:${position}`) || {
          passengerType: fare.passengerType,
          position,
          fullName: null,
          contactPhone: null,
          dateOfBirth: null,
          ticketNumber: null,
        }
      )
    }),
  )

  return slots.length > 0 ? slots : detail.passengers
}

function makeDraft(detail: TicketCompletionDetail): CompletionDraft {
  const passengers = passengerSlots(detail)
  const leadIndex = passengers.findIndex((passenger) => passenger.passengerType === 'ADT')
  const fallbackLeadIndex = leadIndex >= 0 ? leadIndex : passengers.length > 0 ? 0 : -1

  return {
    onBehalfReason: '',
    contactPhone: detail.contactPhone || '',
    departureDate: detail.departureDate || '',
    returnDate: detail.returnDate || '',
    paymentStatus:
      detail.paymentStatus === 'paid'
        ? 'paid'
        : detail.paymentStatus === 'part_paid'
          ? 'part_paid'
          : 'unpaid',
    paidAt: detail.paidAt,
    fareSales: detail.fares.map((fare) => ({
      passengerType: fare.passengerType,
      unitSalePrice: moneyInputValue(fare.unitSalePrice),
    })),
    passengers: passengers.map((passenger, index) => ({
      passengerType: passenger.passengerType,
      position: passenger.position,
      fullName:
        passenger.fullName || (index === fallbackLeadIndex ? detail.customerName.trim() : ''),
      contactPhone: passenger.contactPhone || '',
      dateOfBirth: passenger.dateOfBirth || '',
      ticketNumber: passenger.ticketNumber || '',
    })),
  }
}

function fieldClass(hasError: boolean) {
  return `mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 ${
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

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

export function TicketCompletionDrawer({
  bookingId,
  timezone,
  onClose,
  onSaved,
}: {
  bookingId: string | null
  timezone: string
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [detail, setDetail] = useState<TicketCompletionDetail | null>(null)
  const [completionContext, setCompletionContext] = useState<TicketCompletionContext | null>(null)
  const [draft, setDraft] = useState<CompletionDraft | null>(null)
  const [initialDraft, setInitialDraft] = useState<CompletionDraft | null>(null)
  const [errors, setErrors] = useState<CompletionErrors>({})
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const idempotencyKey = useRef(newIdempotencyKey())
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!bookingId) {
      setDetail(null)
      setCompletionContext(null)
      setDraft(null)
      setInitialDraft(null)
      setLoadError('')
      setSaveError('')
      setErrors({})
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setLoadError('')
    setSaveError('')
    setErrors({})
    setDetail(null)
    setCompletionContext(null)
    setDraft(null)
    setInitialDraft(null)
    idempotencyKey.current = newIdempotencyKey()

    void loadTicketCompletionDetail(bookingId, controller.signal)
      .then(({ detail: nextDetail, completionContext: nextCompletionContext }) => {
        const nextDraft = makeDraft(nextDetail)
        setDetail(nextDetail)
        setCompletionContext(nextCompletionContext)
        setDraft(nextDraft)
        setInitialDraft(nextDraft)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setLoadError(
          error instanceof TicketLedgerApiError
            ? error.message
            : 'Unable to load these ticket details. Try again.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [bookingId, retryCount])

  const dirty = Boolean(
    draft && initialDraft && JSON.stringify(draft) !== JSON.stringify(initialDraft),
  )
  const operationalDirty = Boolean(
    draft &&
    initialDraft &&
    JSON.stringify({ ...draft, onBehalfReason: '' }) !==
      JSON.stringify({ ...initialDraft, onBehalfReason: '' }),
  )
  const isOnBehalf = completionContext?.isOnBehalf === true
  const onBehalfReasonRequired = isOnBehalf && completionContext?.onBehalfReasonRequired === true

  const draftStatus = useMemo(() => {
    if (!draft) return 'needs_details'
    const hasEverySale = draft.fareSales.every((fare) => MONEY_PATTERN.test(fare.unitSalePrice))
    const hasEveryPassengerName =
      draft.passengers.length > 0 &&
      draft.passengers.every((passenger) => passenger.fullName.trim())
    return draft.contactPhone.trim() && draft.departureDate && hasEverySale && hasEveryPassengerName
      ? 'complete'
      : 'needs_details'
  }, [draft])
  const leadPassengerIndex = draft
    ? Math.max(
        draft.passengers.findIndex((passenger) => passenger.passengerType === 'ADT'),
        0,
      )
    : -1

  const updateDraft = (update: (current: CompletionDraft) => CompletionDraft) => {
    if (isSaving) return
    idempotencyKey.current = newIdempotencyKey()
    setDraft((current) => (current ? update(current) : current))
    setErrors({})
    setSaveError('')
  }

  const requestClose = () => {
    if (isSaving) return
    if (dirty) {
      setConfirmDiscard(true)
      return
    }
    onClose()
  }

  const validate = (): CompletionErrors => {
    if (!detail || !draft) return { form: 'Ticket details are not ready.' }
    const nextErrors: CompletionErrors = {}

    if (onBehalfReasonRequired && !draft.onBehalfReason.trim()) {
      nextErrors.onBehalfReason = 'Enter a reason for completing this ticket on behalf of staff.'
    } else if (draft.onBehalfReason.trim().length > 500) {
      nextErrors.onBehalfReason = 'Keep the on-behalf reason to 500 characters or fewer.'
    }

    if (draft.contactPhone.trim().length > 50) {
      nextErrors.contactPhone = 'Contact number must be 50 characters or fewer.'
    }
    if (draft.returnDate && !draft.departureDate) {
      nextErrors.departureDate = 'Enter a departure date before adding a return date.'
    } else if (draft.returnDate && draft.returnDate < draft.departureDate) {
      nextErrors.returnDate = 'Return date cannot be before departure date.'
    }

    const saleValues = new Map(
      draft.fareSales.map((fare) => [fare.passengerType, fare.unitSalePrice.trim()]),
    )
    for (const fare of draft.fareSales) {
      const value = fare.unitSalePrice.trim()
      if (!value) continue
      if (!MONEY_PATTERN.test(value) || Number(value) > MONEY_MAX) {
        nextErrors[`fare.${fare.passengerType}`] = 'Enter a GBP amount with up to 2 decimals.'
      }
    }

    if (detail.operationalStatus === 'issued') {
      const originallyMissing = detail.fares.filter(
        (fare) => !fare.salePriceLocked && fare.unitSalePrice === null,
      )
      const enteredMissing = originallyMissing.filter((fare) =>
        Boolean(saleValues.get(fare.passengerType)),
      )
      if (enteredMissing.length > 0 && enteredMissing.length < originallyMissing.length) {
        nextErrors.fareSales =
          'For an issued ticket, enter every missing grouped sale price together or leave them all blank.'
      }
    }

    const allSalePricesPresent = draft.fareSales.every((fare) =>
      MONEY_PATTERN.test(fare.unitSalePrice.trim()),
    )
    if (draft.paymentStatus === 'paid' && !allSalePricesPresent) {
      nextErrors.paymentStatus =
        'Every grouped sale price is required before marking this ticket Paid.'
    }
    if (draft.paymentStatus === 'part_paid') {
      nextErrors.paymentStatus =
        'Part-paid records require the future payment or correction workflow before more details can be saved.'
    }

    for (const passenger of draft.passengers) {
      const prefix = `passenger.${passenger.passengerType}.${passenger.position}`
      if (passenger.fullName.trim().length > 200) {
        nextErrors[`${prefix}.fullName`] = 'Passenger name must be 200 characters or fewer.'
      }
      if (passenger.contactPhone.trim().length > 50) {
        nextErrors[`${prefix}.contactPhone`] = 'Contact number must be 50 characters or fewer.'
      }
      if (passenger.ticketNumber.trim().length > 50) {
        nextErrors[`${prefix}.ticketNumber`] = 'Ticket number must be 50 characters or fewer.'
      }
    }

    return nextErrors
  }

  const focusFirstError = () => {
    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!bookingId || !detail || !draft || isSaving) return

    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError()
      return
    }
    if (draft.paymentStatus === 'part_paid') return

    const input: TicketCompletionUpdate = {
      expectedBookingVersion: detail.bookingVersion,
      expectedTransactionVersion: detail.transactionVersion,
      contactPhone: draft.contactPhone.trim() || null,
      departureDate: draft.departureDate || null,
      returnDate: draft.returnDate || null,
      paymentStatus: draft.paymentStatus,
      paidAt: draft.paymentStatus === 'paid' ? draft.paidAt || todayInTimezone(timezone) : null,
      onBehalfReason: isOnBehalf ? draft.onBehalfReason.trim() || null : null,
      fareSales: draft.fareSales.map((fare) => ({
        passengerType: fare.passengerType,
        unitSalePrice: fare.unitSalePrice.trim() ? Number(fare.unitSalePrice) : null,
      })),
      passengers: draft.passengers.map((passenger) => ({
        passengerType: passenger.passengerType,
        position: passenger.position,
        fullName: passenger.fullName.trim() || null,
        contactPhone: passenger.contactPhone.trim() || null,
        dateOfBirth: passenger.dateOfBirth || null,
        ticketNumber: passenger.ticketNumber.trim() || null,
      })),
    }

    setIsSaving(true)
    setSaveError('')
    try {
      await updateTicketCompletionDetail(bookingId, input, idempotencyKey.current)
      toast.success(
        isOnBehalf && completionContext
          ? `Ticket details saved on behalf of ${completionContext.ownerEmployee.fullName}`
          : 'Ticket details saved',
      )
      setInitialDraft(draft)
      onClose()
      void onSaved()
    } catch (error) {
      if (error instanceof TicketLedgerApiError) {
        setErrors(error.fieldErrors)
        setSaveError(
          error.code === 'VERSION_CONFLICT'
            ? 'This ticket changed after you opened it. Your entries are still here; close and reopen the drawer to load the latest version.'
            : error.message,
        )
      } else {
        setSaveError('Unable to save the ticket details. Your entries are still here for retry.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const title = detail ? `Complete ${detail.pnr} ticket details` : 'Complete ticket details'
  const description = detail
    ? `${detail.airline.iataCode} · ${detail.airline.name} · ${titleCase(detail.operationalStatus)}`
    : 'Add the remaining operational details without slowing down quick entry.'

  const footer =
    detail && draft && completionContext ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-slate-500">
          Blank optional fields can be completed later.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={requestClose}
            disabled={isSaving}
            className="ui-tap ui-focus min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 sm:flex-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="ticket-completion-form"
            disabled={isSaving || !operationalDirty || draft.paymentStatus === 'part_paid'}
            className="ui-tap ui-focus inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {isSaving ? 'Saving…' : isOnBehalf ? 'Save on behalf' : 'Save details'}
          </button>
        </div>
      </div>
    ) : undefined

  return (
    <>
      <DrawerBase
        isOpen={Boolean(bookingId)}
        onClose={requestClose}
        title={title}
        description={description}
        footer={footer}
        isLoading={isSaving}
        closeDisabled={isSaving}
        isActive={!confirmDiscard}
      >
        {isLoading ? (
          <div
            className="flex min-h-80 flex-col items-center justify-center gap-3 p-6"
            role="status"
          >
            <Loader2 className="h-7 w-7 animate-spin text-[#8b1e2d]" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-600">Loading ticket details…</p>
          </div>
        ) : loadError ? (
          <div
            className="flex min-h-80 flex-col items-center justify-center p-6 text-center"
            role="alert"
          >
            <CircleAlert className="h-9 w-9 text-red-600" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-black text-slate-950">Details unavailable</h3>
            <p className="mt-2 max-w-md text-sm text-red-700">{loadError}</p>
            <button
              type="button"
              onClick={() => setRetryCount((current) => current + 1)}
              className="ui-tap ui-focus mt-5 min-h-11 rounded-xl bg-[#8b1e2d] px-5 text-sm font-bold text-white"
            >
              Try again
            </button>
          </div>
        ) : detail && draft && completionContext ? (
          <form
            ref={formRef}
            id="ticket-completion-form"
            onSubmit={submit}
            noValidate
            className="space-y-6 p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <p className="font-mono text-lg font-black tracking-wide text-slate-950">
                  {detail.pnr}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-600">{detail.customerName}</p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ring-1 ${
                  draftStatus === 'complete'
                    ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                    : 'bg-amber-50 text-amber-800 ring-amber-200'
                }`}
              >
                {draftStatus === 'complete' ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <CircleAlert className="h-4 w-4" aria-hidden="true" />
                )}
                {draftStatus === 'complete' ? 'Details complete' : 'Needs details'}
              </span>
            </div>

            {isOnBehalf && (
              <section
                aria-label="On-behalf completion"
                className="rounded-2xl border border-sky-200 bg-sky-50 p-4"
              >
                <p className="text-xs font-black uppercase tracking-[0.14em] text-sky-900">
                  Completing on behalf of staff
                </p>
                <p className="mt-1 text-sm font-bold text-sky-950">
                  Responsible agent: {completionContext.ownerEmployee.fullName}
                </p>
                <p className="mt-1 text-xs font-semibold text-sky-800">
                  Your signed-in account is recorded as the acting employee. Ticket responsibility
                  and staff attribution stay with the responsible agent.
                </p>
                <label className="mt-3 block text-xs font-bold text-slate-700">
                  On-behalf reason
                  <textarea
                    autoFocus
                    value={draft.onBehalfReason}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        onBehalfReason: event.target.value,
                      }))
                    }
                    maxLength={500}
                    rows={2}
                    required={onBehalfReasonRequired}
                    disabled={isSaving || draft.paymentStatus === 'part_paid'}
                    aria-label="On-behalf completion reason"
                    aria-invalid={Boolean(errors.onBehalfReason)}
                    aria-describedby={
                      errors.onBehalfReason ? 'ticket-on-behalf-reason-error' : undefined
                    }
                    className={fieldClass(Boolean(errors.onBehalfReason))}
                    placeholder="For example: completing the record while the agent is off sick"
                  />
                  <FieldError id="ticket-on-behalf-reason-error" message={errors.onBehalfReason} />
                </label>
              </section>
            )}

            {saveError && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
              >
                {saveError}
              </div>
            )}

            {draft.paymentStatus === 'part_paid' && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
              >
                This record is Part Paid. It is read-only here until the dedicated payment or
                correction workflow is available.
              </div>
            )}

            <fieldset
              disabled={isSaving || draft.paymentStatus === 'part_paid'}
              className="space-y-3"
            >
              <legend className="flex items-center gap-2 text-sm font-black text-slate-950">
                <CalendarDays className="h-4 w-4 text-[#8b1e2d]" aria-hidden="true" />
                Customer and journey
              </legend>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-bold text-slate-700 sm:col-span-3">
                  Contact number
                  <input
                    type="tel"
                    inputMode="tel"
                    value={draft.contactPhone}
                    onChange={(event) =>
                      updateDraft((current) => ({ ...current, contactPhone: event.target.value }))
                    }
                    maxLength={50}
                    autoComplete="tel"
                    aria-invalid={Boolean(errors.contactPhone)}
                    aria-describedby={
                      errors.contactPhone ? 'ticket-detail-contact-error' : undefined
                    }
                    className={fieldClass(Boolean(errors.contactPhone))}
                    placeholder="Customer contact number"
                  />
                  <FieldError id="ticket-detail-contact-error" message={errors.contactPhone} />
                </label>
                <label className="text-xs font-bold text-slate-700">
                  Departure date
                  <input
                    type="date"
                    value={draft.departureDate}
                    onChange={(event) =>
                      updateDraft((current) => ({ ...current, departureDate: event.target.value }))
                    }
                    aria-invalid={Boolean(errors.departureDate)}
                    aria-describedby={
                      errors.departureDate ? 'ticket-detail-departure-error' : undefined
                    }
                    className={fieldClass(Boolean(errors.departureDate))}
                  />
                  <FieldError id="ticket-detail-departure-error" message={errors.departureDate} />
                </label>
                <label className="text-xs font-bold text-slate-700 sm:col-span-2">
                  Return date <span className="font-normal text-slate-400">(optional)</span>
                  <input
                    type="date"
                    value={draft.returnDate}
                    min={draft.departureDate || undefined}
                    onChange={(event) =>
                      updateDraft((current) => ({ ...current, returnDate: event.target.value }))
                    }
                    aria-invalid={Boolean(errors.returnDate)}
                    aria-describedby={errors.returnDate ? 'ticket-detail-return-error' : undefined}
                    className={fieldClass(Boolean(errors.returnDate))}
                  />
                  <FieldError id="ticket-detail-return-error" message={errors.returnDate} />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Dates provide the ledger summary only. Use the Itinerary action on the TK row for
                Flight Monitoring sectors. Ledger times use {timezone}.
              </p>
            </fieldset>

            <fieldset
              disabled={isSaving || draft.paymentStatus === 'part_paid'}
              className="space-y-3"
            >
              <legend className="flex items-center gap-2 text-sm font-black text-slate-950">
                <WalletCards className="h-4 w-4 text-[#8b1e2d]" aria-hidden="true" />
                Sale and payment
              </legend>
              <div className="space-y-3">
                {detail.fares.map((fare) => {
                  const sale = draft.fareSales.find(
                    (candidate) => candidate.passengerType === fare.passengerType,
                  )
                  const error = errors[`fare.${fare.passengerType}`]
                  const errorId = `ticket-detail-${fare.passengerType.toLowerCase()}-sale-error`
                  const describedBy = [
                    error ? errorId : '',
                    errors.fareSales ? 'ticket-detail-fares-error' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <div
                      key={fare.id}
                      className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-end"
                    >
                      <div>
                        <p className="text-sm font-black text-slate-950">{fare.passengerType}</p>
                        <p className="text-xs text-slate-500">{fare.quantity} ticket(s)</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-slate-500">Unit fare cost</p>
                        <p className="mt-1 min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700">
                          {formatMoney(fare.unitSupplierCost)}
                        </p>
                      </div>
                      <label className="text-[11px] font-bold text-slate-600">
                        Unit sale price (£)
                        <input
                          type="text"
                          inputMode="decimal"
                          value={sale?.unitSalePrice || ''}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              fareSales: current.fareSales.map((candidate) =>
                                candidate.passengerType === fare.passengerType
                                  ? { ...candidate, unitSalePrice: event.target.value }
                                  : candidate,
                              ),
                            }))
                          }
                          disabled={
                            (fare.salePriceLocked && !completionContext.canManageRecords) ||
                            isSaving
                          }
                          aria-label={`${fare.passengerType} unit sale price`}
                          aria-invalid={Boolean(error || errors.fareSales)}
                          aria-describedby={describedBy || undefined}
                          className={fieldClass(Boolean(error || errors.fareSales))}
                          placeholder="0.00"
                        />
                        {fare.salePriceLocked && !completionContext.canManageRecords && (
                          <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                            Locked — request an admin amendment
                          </span>
                        )}
                        {fare.salePriceLocked && completionContext.canManageRecords && (
                          <span className="mt-1 block text-[10px] font-semibold text-violet-700">
                            Admin correction is audited
                          </span>
                        )}
                        <FieldError id={errorId} message={error} />
                      </label>
                    </div>
                  )
                })}
              </div>
              <FieldError id="ticket-detail-fares-error" message={errors.fareSales} />

              <label className="block text-xs font-bold text-slate-700">
                Payment status
                <select
                  value={draft.paymentStatus}
                  disabled={
                    detail.paymentStatus === 'paid' ||
                    detail.paymentStatus === 'part_paid' ||
                    isSaving
                  }
                  onChange={(event) => {
                    const paymentStatus = event.target.value as 'unpaid' | 'paid'
                    updateDraft((current) => ({
                      ...current,
                      paymentStatus,
                      paidAt:
                        paymentStatus === 'paid'
                          ? current.paidAt || todayInTimezone(timezone)
                          : null,
                    }))
                  }}
                  aria-invalid={Boolean(errors.paymentStatus)}
                  aria-describedby={
                    errors.paymentStatus ? 'ticket-detail-payment-error' : undefined
                  }
                  className={fieldClass(Boolean(errors.paymentStatus))}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="part_paid" disabled>
                    Part Paid — requires payment workflow
                  </option>
                  <option value="paid">Paid</option>
                </select>
                <FieldError id="ticket-detail-payment-error" message={errors.paymentStatus} />
                {detail.paymentStatus === 'paid' && (
                  <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                    Recorded payments cannot be moved backwards.
                  </span>
                )}
              </label>
            </fieldset>

            <fieldset
              disabled={isSaving || draft.paymentStatus === 'part_paid'}
              className="space-y-3"
            >
              <legend className="flex items-center gap-2 text-sm font-black text-slate-950">
                <Users className="h-4 w-4 text-[#8b1e2d]" aria-hidden="true" />
                Passenger details
              </legend>
              <p className="text-xs text-slate-500">
                Passenger slots follow the saved ADT, CHD and INF quantities. Names complete the
                operational record; the other fields can be added later.
              </p>
              <div className="space-y-3">
                {draft.passengers.map((passenger, index) => {
                  const prefix = `passenger.${passenger.passengerType}.${passenger.position}`
                  const idPrefix = `ticket-detail-${passenger.passengerType.toLowerCase()}-${passenger.position}`
                  return (
                    <div
                      key={`${passenger.passengerType}-${passenger.position}`}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-black text-slate-950">
                          {passenger.passengerType} {passenger.position}
                        </p>
                        {index === leadPassengerIndex && (
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                            Lead passenger
                          </span>
                        )}
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-[11px] font-bold text-slate-600 sm:col-span-2">
                          Passenger name
                          <input
                            value={passenger.fullName}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                passengers: current.passengers.map((candidate, candidateIndex) =>
                                  candidateIndex === index
                                    ? { ...candidate, fullName: event.target.value }
                                    : candidate,
                                ),
                              }))
                            }
                            maxLength={200}
                            autoComplete="off"
                            aria-label={`${passenger.passengerType} ${passenger.position} passenger name`}
                            aria-invalid={Boolean(errors[`${prefix}.fullName`])}
                            aria-describedby={
                              errors[`${prefix}.fullName`] ? `${idPrefix}-name-error` : undefined
                            }
                            className={fieldClass(Boolean(errors[`${prefix}.fullName`]))}
                            placeholder="Passenger name"
                          />
                          <FieldError
                            id={`${idPrefix}-name-error`}
                            message={errors[`${prefix}.fullName`]}
                          />
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                          Ticket number{' '}
                          <span className="font-normal text-slate-400">(optional)</span>
                          <input
                            value={passenger.ticketNumber}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                passengers: current.passengers.map((candidate, candidateIndex) =>
                                  candidateIndex === index
                                    ? {
                                        ...candidate,
                                        ticketNumber: event.target.value.toUpperCase(),
                                      }
                                    : candidate,
                                ),
                              }))
                            }
                            maxLength={50}
                            autoComplete="off"
                            spellCheck={false}
                            aria-label={`${passenger.passengerType} ${passenger.position} ticket number`}
                            aria-invalid={Boolean(errors[`${prefix}.ticketNumber`])}
                            aria-describedby={
                              errors[`${prefix}.ticketNumber`]
                                ? `${idPrefix}-ticket-error`
                                : undefined
                            }
                            className={`${fieldClass(Boolean(errors[`${prefix}.ticketNumber`]))} font-mono uppercase`}
                            placeholder="Ticket number"
                          />
                          <FieldError
                            id={`${idPrefix}-ticket-error`}
                            message={errors[`${prefix}.ticketNumber`]}
                          />
                        </label>
                        <label className="text-[11px] font-bold text-slate-600">
                          Date of birth{' '}
                          <span className="font-normal text-slate-400">(optional)</span>
                          <input
                            type="date"
                            value={passenger.dateOfBirth}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                passengers: current.passengers.map((candidate, candidateIndex) =>
                                  candidateIndex === index
                                    ? { ...candidate, dateOfBirth: event.target.value }
                                    : candidate,
                                ),
                              }))
                            }
                            aria-label={`${passenger.passengerType} ${passenger.position} date of birth`}
                            className={fieldClass(false)}
                          />
                        </label>
                        <label className="text-[11px] font-bold text-slate-600 sm:col-span-2">
                          Passenger contact{' '}
                          <span className="font-normal text-slate-400">(only if different)</span>
                          <input
                            type="tel"
                            inputMode="tel"
                            value={passenger.contactPhone}
                            onChange={(event) =>
                              updateDraft((current) => ({
                                ...current,
                                passengers: current.passengers.map((candidate, candidateIndex) =>
                                  candidateIndex === index
                                    ? { ...candidate, contactPhone: event.target.value }
                                    : candidate,
                                ),
                              }))
                            }
                            maxLength={50}
                            autoComplete="off"
                            aria-label={`${passenger.passengerType} ${passenger.position} contact number`}
                            aria-invalid={Boolean(errors[`${prefix}.contactPhone`])}
                            aria-describedby={
                              errors[`${prefix}.contactPhone`]
                                ? `${idPrefix}-contact-error`
                                : undefined
                            }
                            className={fieldClass(Boolean(errors[`${prefix}.contactPhone`]))}
                            placeholder="Uses lead contact when blank"
                          />
                          <FieldError
                            id={`${idPrefix}-contact-error`}
                            message={errors[`${prefix}.contactPhone`]}
                          />
                        </label>
                      </div>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          </form>
        ) : null}
      </DrawerBase>

      <ConfirmationDialog
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(onClose)
          } else {
            onClose()
          }
        }}
        title="Discard unsaved ticket details?"
        message="Your changes in this drawer have not been saved."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        type="warning"
      />
    </>
  )
}
