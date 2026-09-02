'use client'

import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { CheckCircle2, Eraser, Save, UserRoundCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmationDialog } from '@/components'
import { createTkTicket, TicketLedgerApiError } from './ledgerClientApi'
import type {
  CreateTkTicketInput,
  DuplicateTkRecord,
  TicketAirlineOption,
  TicketAttributionEmployee,
  TicketCommercialTreatment,
  TicketPassengerType,
  TicketSupplierCode,
} from './types'

const PASSENGER_TYPES: TicketPassengerType[] = ['ADT', 'YTH', 'CHD', 'INF']
const MONEY_PATTERN = /^\d+(?:\.\d{1,2})?$/

type FareDraft = Record<
  TicketPassengerType,
  {
    quantity: string
    unitSupplierCost: string
    unitSalePrice: string
    hasDiscount: boolean
    unitDiscount: string
  }
>

type QuickEntryDraft = {
  customerName: string
  contactEmail: string
  pnr: string
  airlineCode: string
  supplierCode: TicketSupplierCode
  operationalStatus: 'held' | 'issued'
  bookingDate: string
  timeLimitAt: string
  issuedAt: string
  fares: FareDraft
  commercialTreatment: TicketCommercialTreatment
  commissionWaiverReason: string
  responsibleEmployeeId: string
  assistantEmployeeIds: string[]
  attributionReason: string
}

type QuickEntryErrors = Record<string, string>

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

function initialDraft(
  timezone: string,
  responsibleEmployeeId: string,
  airlineCode = '',
): QuickEntryDraft {
  const today = todayInTimezone(timezone)
  return {
    customerName: '',
    contactEmail: '',
    pnr: '',
    airlineCode,
    supplierCode: 'sabre_polani',
    operationalStatus: 'issued',
    bookingDate: today,
    timeLimitAt: '',
    issuedAt: today,
    fares: {
      ADT: {
        quantity: '1',
        unitSupplierCost: '',
        unitSalePrice: '',
        hasDiscount: false,
        unitDiscount: '0',
      },
      YTH: {
        quantity: '0',
        unitSupplierCost: '',
        unitSalePrice: '',
        hasDiscount: false,
        unitDiscount: '0',
      },
      CHD: {
        quantity: '0',
        unitSupplierCost: '',
        unitSalePrice: '',
        hasDiscount: false,
        unitDiscount: '0',
      },
      INF: {
        quantity: '0',
        unitSupplierCost: '',
        unitSalePrice: '',
        hasDiscount: false,
        unitDiscount: '0',
      },
    },
    commercialTreatment: 'standard',
    commissionWaiverReason: '',
    responsibleEmployeeId,
    assistantEmployeeIds: [],
    attributionReason: '',
  }
}

function newIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ticket-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function fieldClass(hasError: boolean) {
  return `mt-1 min-w-0 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 ${
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

export function TicketQuickEntryForm({
  airlines,
  timezone,
  employeeId,
  employeeName,
  canManageAttribution,
  attributionEmployees,
  onCreated,
}: {
  airlines: TicketAirlineOption[]
  timezone: string
  employeeId: string
  employeeName: string
  canManageAttribution: boolean
  attributionEmployees: TicketAttributionEmployee[]
  onCreated: () => Promise<void>
}) {
  const [draft, setDraft] = useState<QuickEntryDraft>(() => initialDraft(timezone, employeeId))
  const [errors, setErrors] = useState<QuickEntryErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const [duplicate, setDuplicate] = useState<DuplicateTkRecord | null>(null)
  const [pendingDuplicateInput, setPendingDuplicateInput] = useState<CreateTkTicketInput | null>(
    null,
  )
  const idempotencyKey = useRef(newIdempotencyKey())
  const customerInput = useRef<HTMLInputElement>(null)
  const attributionOverride = canManageAttribution && draft.responsibleEmployeeId !== employeeId
  const isStaffFamilyBooking = draft.commercialTreatment === 'staff_family'
  const selectedAssistantEmployees = draft.assistantEmployeeIds.flatMap((id) => {
    const employee = attributionEmployees.find((option) => option.id === id)
    return employee ? [employee] : []
  })

  const updateDraft = (update: (current: QuickEntryDraft) => QuickEntryDraft) => {
    if (isSaving) return
    idempotencyKey.current = newIdempotencyKey()
    setDraft(update)
    setErrors({})
  }

  const reset = (retainAirline = false) => {
    setDraft(initialDraft(timezone, employeeId, retainAirline ? draft.airlineCode : ''))
    setErrors({})
    setDuplicate(null)
    setPendingDuplicateInput(null)
    idempotencyKey.current = newIdempotencyKey()
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => customerInput.current?.focus())
    } else {
      customerInput.current?.focus()
    }
  }

  const validate = (): { input?: CreateTkTicketInput; errors: QuickEntryErrors } => {
    const nextErrors: QuickEntryErrors = {}
    const customerName = draft.customerName.trim()
    const contactEmail = draft.contactEmail.trim().toLowerCase()
    const pnr = draft.pnr.trim().toUpperCase().replace(/\s+/g, '')
    const airline = airlines.find(
      (option) => option.iataCode.toUpperCase() === draft.airlineCode.trim().toUpperCase(),
    )
    const attributionOverride = canManageAttribution && draft.responsibleEmployeeId !== employeeId

    if (!customerName) nextErrors.customerName = 'Enter the customer or lead passenger name.'
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      nextErrors.contactEmail = 'Enter a valid customer email or leave this blank.'
    }
    if (!pnr) nextErrors.pnr = 'Enter the PNR.'
    if (!airline) nextErrors.airlineCode = 'Choose an active airline code from the list.'
    if (!draft.bookingDate) nextErrors.bookingDate = 'Enter the booking date.'
    if (draft.operationalStatus === 'held' && !draft.timeLimitAt) {
      nextErrors.timeLimitAt = 'A held booking needs an airline time limit.'
    } else if (
      draft.timeLimitAt &&
      draft.bookingDate &&
      draft.timeLimitAt.slice(0, 10) < draft.bookingDate
    ) {
      nextErrors.timeLimitAt = 'Airline time limit cannot be before the booking date.'
    }
    if (draft.operationalStatus === 'issued' && !draft.issuedAt) {
      nextErrors.issuedAt = 'An issued ticket needs an issued date.'
    } else if (draft.issuedAt && draft.bookingDate && draft.issuedAt < draft.bookingDate) {
      nextErrors.issuedAt = 'Issued date cannot be before the booking date.'
    }
    const availableEmployeeIds = new Set(attributionEmployees.map((employee) => employee.id))
    if (canManageAttribution) {
      if (!availableEmployeeIds.has(draft.responsibleEmployeeId)) {
        nextErrors.responsibleEmployeeId = 'Choose an active responsible agent.'
      }
      if (attributionOverride && !draft.attributionReason.trim()) {
        nextErrors.attributionReason = 'Explain why this ticket is being entered for other staff.'
      } else if (draft.attributionReason.trim().length > 500) {
        nextErrors.attributionReason = 'Keep the attribution reason to 500 characters or fewer.'
      }
    }
    if (draft.assistantEmployeeIds.length > 10) {
      nextErrors.assistantEmployeeIds = 'A ticket can have at most 10 assistants.'
    } else if (
      draft.assistantEmployeeIds.includes(draft.responsibleEmployeeId) ||
      draft.assistantEmployeeIds.some((id) => !availableEmployeeIds.has(id))
    ) {
      nextErrors.assistantEmployeeIds = 'Choose valid assistants who are not the responsible agent.'
    }

    if (
      draft.commercialTreatment !== 'standard' &&
      draft.commissionWaiverReason.trim().length < 3
    ) {
      nextErrors.commissionWaiverReason =
        'Enter the family relationship or reason for waiving commission.'
    } else if (draft.commissionWaiverReason.trim().length > 500) {
      nextErrors.commissionWaiverReason = 'Keep the commission waiver reason to 500 characters.'
    }

    const fares = PASSENGER_TYPES.flatMap((passengerType) => {
      const fare = draft.fares[passengerType]
      const quantity = Number(fare.quantity)
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
        nextErrors[`fare.${passengerType}.quantity`] = 'Use a whole number from 0 to 99.'
        return []
      }
      if (quantity === 0) return []
      if (!MONEY_PATTERN.test(fare.unitSupplierCost)) {
        nextErrors[`fare.${passengerType}.unitSupplierCost`] =
          'Enter a GBP amount with up to 2 decimals.'
        return []
      }
      const unitSupplierCost = Number(fare.unitSupplierCost)
      if (unitSupplierCost > 99_999_999.99) {
        nextErrors[`fare.${passengerType}.unitSupplierCost`] =
          'Fare cost is above the allowed limit.'
        return []
      }
      let unitSalePrice: number | null = null
      let unitDiscount: number | null = null
      const effectiveSalePrice = isStaffFamilyBooking
        ? fare.unitSupplierCost.trim()
        : fare.unitSalePrice.trim()
      if (draft.operationalStatus === 'issued' && effectiveSalePrice) {
        if (!MONEY_PATTERN.test(effectiveSalePrice)) {
          nextErrors[`fare.${passengerType}.unitSalePrice`] =
            'Enter the sale price per ticket with up to 2 decimals.'
          return []
        }
        const discountInput = isStaffFamilyBooking
          ? '0'
          : fare.hasDiscount
            ? fare.unitDiscount
            : '0'
        if (!MONEY_PATTERN.test(discountInput)) {
          nextErrors[`fare.${passengerType}.unitDiscount`] =
            'Enter the discount per ticket with up to 2 decimals.'
          return []
        }
        unitSalePrice = Number(effectiveSalePrice)
        unitDiscount = Number(discountInput)
        if (unitSalePrice > 99_999_999.99 || unitDiscount > unitSalePrice) {
          nextErrors[`fare.${passengerType}.unitDiscount`] =
            unitDiscount > unitSalePrice
              ? 'Discount cannot exceed the sale price.'
              : 'Sale price is above the allowed limit.'
          return []
        }
      }
      return [{ passengerType, quantity, unitSupplierCost, unitSalePrice, unitDiscount }]
    })

    if (draft.operationalStatus === 'issued') {
      const pricedFareCount = fares.filter((fare) => fare.unitSalePrice !== null).length
      if (pricedFareCount > 0 && pricedFareCount < fares.length) {
        nextErrors.fares =
          'Enter every standalone sale price, or leave every sale price blank for a package PNR.'
      }
    }

    if (fares.length === 0 && !Object.keys(nextErrors).some((key) => key.startsWith('fare.'))) {
      nextErrors.fares = 'Add at least one ADT, YTH, CHD, or INF passenger.'
    } else if (fares.reduce((total, fare) => total + fare.quantity, 0) > 99) {
      nextErrors.fares = 'A quick entry can contain at most 99 passengers.'
    }

    if (Object.keys(nextErrors).length > 0 || !airline) return { errors: nextErrors }

    return {
      errors: {},
      input: {
        customerName,
        contactEmail: contactEmail || null,
        pnr,
        airlineId: airline.id,
        supplierCode: draft.supplierCode,
        serviceType: 'TK',
        operationalStatus: draft.operationalStatus,
        bookingDate: draft.bookingDate,
        timeLimitAt: draft.operationalStatus === 'held' ? draft.timeLimitAt : null,
        issuedAt: draft.operationalStatus === 'issued' ? draft.issuedAt : null,
        currency: 'GBP',
        fares,
        commercialTreatment: draft.commercialTreatment,
        commissionWaiverReason:
          draft.commercialTreatment === 'standard' ? null : draft.commissionWaiverReason.trim(),
        responsibleEmployeeId: draft.responsibleEmployeeId,
        assistantEmployeeIds: draft.assistantEmployeeIds,
        attributionReason: attributionOverride ? draft.attributionReason.trim() : null,
      },
    }
  }

  const save = async (input: CreateTkTicketInput) => {
    setIsSaving(true)
    try {
      const result = await createTkTicket(input, idempotencyKey.current)
      if (result.kind === 'duplicate') {
        setDuplicate(result.existing)
        setPendingDuplicateInput(input)
        return
      }

      toast.success(
        result.pricingSource === 'package_quote'
          ? 'TK ticket saved using package quotation prices'
          : 'TK ticket saved to the sales ledger',
      )
      reset(true)
      void onCreated()
    } catch (error) {
      if (error instanceof TicketLedgerApiError) {
        setErrors(error.fieldErrors)
        toast.error(error.message)
      } else {
        toast.error('Unable to save the ticket. Your entry has been kept for retry.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSaving) return
    const result = validate()
    setErrors(result.errors)
    if (result.input) void save(result.input)
  }

  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      if (!isSaving && !duplicate) event.currentTarget.requestSubmit()
      return
    }
    if (event.key === 'Escape' && !isSaving && !duplicate) {
      event.preventDefault()
      reset()
    }
  }

  return (
    <>
      <form
        onSubmit={submit}
        onKeyDown={handleFormKeyDown}
        aria-label="New TK ticket"
        className="overflow-hidden rounded-2xl border border-red-100 bg-white shadow-sm"
      >
        <div className="flex flex-col gap-3 border-b border-red-100 bg-gradient-to-r from-red-50 via-white to-slate-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
              Keyboard-first entry
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">New TK ticket</h2>
            <p className="mt-1 text-xs text-slate-500">
              Tab through the row, press Ctrl/⌘ + Enter to save, or Escape to clear.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-black uppercase tracking-wide">
            <span className="rounded-full bg-slate-900 px-2.5 py-1 text-white">GBP</span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800 ring-1 ring-amber-200">
              Unpaid
            </span>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-sky-800 ring-1 ring-sky-200">
              {timezone}
            </span>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-5">
          {airlines.length === 0 && (
            <div
              role="alert"
              className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200"
            >
              No active airlines are configured. Ask a Manager or Admin to add airline codes before
              saving a ticket.
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-8">
            <label className="text-xs font-bold text-slate-700 sm:col-span-2 xl:col-span-2">
              Customer / lead passenger
              <input
                ref={customerInput}
                autoFocus
                value={draft.customerName}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, customerName: event.target.value }))
                }
                autoComplete="off"
                disabled={isSaving}
                aria-label="Customer / lead passenger"
                aria-invalid={Boolean(errors.customerName)}
                aria-describedby={errors.customerName ? 'ticket-customer-error' : undefined}
                className={fieldClass(Boolean(errors.customerName))}
                placeholder="Name Surname or Surname / Name"
              />
              <FieldError id="ticket-customer-error" message={errors.customerName} />
            </label>

            <label className="text-xs font-bold text-slate-700 sm:col-span-2 xl:col-span-2">
              Customer email (portal trips)
              <input
                type="email"
                value={draft.contactEmail}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, contactEmail: event.target.value }))
                }
                autoComplete="email"
                disabled={isSaving}
                aria-label="Customer email for portal trips"
                aria-invalid={Boolean(errors.contactEmail)}
                aria-describedby={errors.contactEmail ? 'ticket-contact-email-error' : undefined}
                className={fieldClass(Boolean(errors.contactEmail))}
                placeholder="customer@example.com"
              />
              <FieldError id="ticket-contact-email-error" message={errors.contactEmail} />
            </label>

            <label className="text-xs font-bold text-slate-700">
              PNR
              <input
                value={draft.pnr}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    pnr: event.target.value.toUpperCase().replace(/\s+/g, ''),
                  }))
                }
                maxLength={20}
                autoComplete="off"
                spellCheck={false}
                disabled={isSaving}
                aria-label="PNR"
                aria-invalid={Boolean(errors.pnr)}
                aria-describedby={errors.pnr ? 'ticket-pnr-error' : undefined}
                className={`${fieldClass(Boolean(errors.pnr))} font-mono font-bold uppercase`}
                placeholder="ABC123"
              />
              <FieldError id="ticket-pnr-error" message={errors.pnr} />
            </label>

            <div className="text-xs font-bold text-slate-700">
              <label htmlFor="ticket-airline-code">Airline</label>
              <input
                id="ticket-airline-code"
                list="ticket-airline-options"
                value={draft.airlineCode}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    airlineCode: event.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                maxLength={2}
                autoComplete="off"
                spellCheck={false}
                disabled={isSaving}
                aria-invalid={Boolean(errors.airlineCode)}
                aria-describedby={errors.airlineCode ? 'ticket-airline-error' : undefined}
                className={`${fieldClass(Boolean(errors.airlineCode))} font-mono font-bold uppercase`}
                placeholder="TK"
              />
              <datalist id="ticket-airline-options">
                {airlines.map((airline) => (
                  <option key={airline.id} value={airline.iataCode} label={airline.name} />
                ))}
              </datalist>
              <FieldError id="ticket-airline-error" message={errors.airlineCode} />
            </div>

            <label className="text-xs font-bold text-slate-700">
              Supplier
              <select
                value={draft.supplierCode}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    supplierCode: event.target.value as TicketSupplierCode,
                  }))
                }
                disabled={isSaving}
                aria-label="Ticket supplier"
                className={fieldClass(false)}
              >
                <option value="sabre_polani">Sabre Polani</option>
                <option value="amadeus_piyam">Amadeus Piyam</option>
                <option value="sabre_bt">Sabre BT</option>
                <option value="ptap">PTAP</option>
                <option value="airline">Airline</option>
              </select>
              {draft.supplierCode === 'airline' && (
                <span className="mt-1 block text-[11px] font-semibold text-sky-800">
                  {airlines.find(
                    (airline) =>
                      airline.iataCode.toUpperCase() === draft.airlineCode.trim().toUpperCase(),
                  )?.name || 'Choose the airline code to resolve its full name.'}
                </span>
              )}
            </label>

            <label className="text-xs font-bold text-slate-700">
              Ticket state
              <select
                value={draft.operationalStatus}
                aria-label="Ticket state"
                disabled={isSaving}
                onChange={(event) =>
                  updateDraft((current) => ({
                    ...current,
                    operationalStatus: event.target.value as 'held' | 'issued',
                  }))
                }
                className={fieldClass(false)}
              >
                <option value="issued">Issued</option>
                <option value="held">Held</option>
              </select>
            </label>

            <label className="text-xs font-bold text-slate-700">
              Booking date
              <input
                type="date"
                value={draft.bookingDate}
                aria-label="Booking date"
                disabled={isSaving}
                onChange={(event) =>
                  updateDraft((current) => ({ ...current, bookingDate: event.target.value }))
                }
                aria-invalid={Boolean(errors.bookingDate)}
                aria-describedby={errors.bookingDate ? 'ticket-booking-date-error' : undefined}
                className={fieldClass(Boolean(errors.bookingDate))}
              />
              <FieldError id="ticket-booking-date-error" message={errors.bookingDate} />
            </label>

            {draft.operationalStatus === 'held' ? (
              <label className="text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-1">
                Airline time limit
                <input
                  type="datetime-local"
                  value={draft.timeLimitAt}
                  aria-label="Airline time limit"
                  disabled={isSaving}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, timeLimitAt: event.target.value }))
                  }
                  aria-invalid={Boolean(errors.timeLimitAt)}
                  aria-describedby={errors.timeLimitAt ? 'ticket-time-limit-error' : undefined}
                  className={fieldClass(Boolean(errors.timeLimitAt))}
                />
                <FieldError id="ticket-time-limit-error" message={errors.timeLimitAt} />
              </label>
            ) : (
              <label className="text-xs font-bold text-slate-700 sm:col-span-2 lg:col-span-1">
                Issued date
                <input
                  type="date"
                  value={draft.issuedAt}
                  aria-label="Issued date"
                  disabled={isSaving}
                  onChange={(event) =>
                    updateDraft((current) => ({ ...current, issuedAt: event.target.value }))
                  }
                  aria-invalid={Boolean(errors.issuedAt)}
                  aria-describedby={errors.issuedAt ? 'ticket-issued-error' : undefined}
                  className={fieldClass(Boolean(errors.issuedAt))}
                />
                <FieldError id="ticket-issued-error" message={errors.issuedAt} />
              </label>
            )}
          </div>

          <fieldset aria-describedby={errors.fares ? 'ticket-fares-error' : undefined}>
            <legend className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Passenger mix and pricing
            </legend>
            {draft.operationalStatus === 'issued' && (
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Package PNR: leave every sale price blank; the accepted quotation supplies each
                passenger rate. Standalone ticket: enter every sale price below.
              </p>
            )}
            <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {PASSENGER_TYPES.map((passengerType) => {
                const fare = draft.fares[passengerType]
                const quantityError = errors[`fare.${passengerType}.quantity`]
                const costError = errors[`fare.${passengerType}.unitSupplierCost`]
                const saleError = errors[`fare.${passengerType}.unitSalePrice`]
                const discountError = errors[`fare.${passengerType}.unitDiscount`]
                const disabled = Number(fare.quantity) === 0
                const fareErrorId = `ticket-${passengerType.toLowerCase()}-fare-error`
                return (
                  <div
                    key={passengerType}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <p className="text-sm font-black text-slate-900">{passengerType}</p>
                    <div className="mt-2 grid grid-cols-[minmax(4.75rem,0.7fr)_minmax(0,1.3fr)] gap-2">
                      <label className="min-w-0 text-[11px] font-bold text-slate-600">
                        Quantity
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={99}
                          step={1}
                          value={fare.quantity}
                          disabled={isSaving}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              fares: {
                                ...current.fares,
                                [passengerType]: {
                                  quantity: event.target.value,
                                  unitSupplierCost:
                                    Number(event.target.value) === 0
                                      ? ''
                                      : current.fares[passengerType].unitSupplierCost,
                                  unitSalePrice:
                                    Number(event.target.value) === 0
                                      ? ''
                                      : current.fares[passengerType].unitSalePrice,
                                  hasDiscount:
                                    Number(event.target.value) === 0
                                      ? false
                                      : current.fares[passengerType].hasDiscount,
                                  unitDiscount:
                                    Number(event.target.value) === 0
                                      ? '0'
                                      : current.fares[passengerType].unitDiscount,
                                },
                              },
                            }))
                          }
                          aria-label={`${passengerType} quantity`}
                          aria-invalid={Boolean(quantityError)}
                          aria-describedby={quantityError ? fareErrorId : undefined}
                          className={fieldClass(Boolean(quantityError))}
                        />
                      </label>
                      <label className="min-w-0 text-[11px] font-bold text-slate-600">
                        Unit fare cost (£)
                        <input
                          type="text"
                          inputMode="decimal"
                          value={fare.unitSupplierCost}
                          disabled={disabled || isSaving}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              fares: {
                                ...current.fares,
                                [passengerType]: {
                                  ...current.fares[passengerType],
                                  unitSupplierCost: event.target.value,
                                  unitSalePrice:
                                    current.commercialTreatment === 'staff_family'
                                      ? event.target.value
                                      : current.fares[passengerType].unitSalePrice,
                                  hasDiscount:
                                    current.commercialTreatment === 'staff_family'
                                      ? false
                                      : current.fares[passengerType].hasDiscount,
                                  unitDiscount:
                                    current.commercialTreatment === 'staff_family'
                                      ? '0'
                                      : current.fares[passengerType].unitDiscount,
                                },
                              },
                            }))
                          }
                          aria-label={`${passengerType} unit fare cost`}
                          aria-invalid={Boolean(costError)}
                          aria-describedby={costError ? fareErrorId : undefined}
                          className={`${fieldClass(Boolean(costError))} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
                          placeholder={disabled ? 'Not used' : '0.00'}
                        />
                      </label>
                      {draft.operationalStatus === 'issued' ? (
                        <>
                          <label className="col-span-2 min-w-0 text-[11px] font-bold text-slate-600">
                            Sale price (£) — standalone only
                            <input
                              type="text"
                              inputMode="decimal"
                              value={fare.unitSalePrice}
                              disabled={disabled || isSaving || isStaffFamilyBooking}
                              onChange={(event) =>
                                updateDraft((current) => ({
                                  ...current,
                                  fares: {
                                    ...current.fares,
                                    [passengerType]: {
                                      ...current.fares[passengerType],
                                      unitSalePrice: event.target.value,
                                      hasDiscount: event.target.value.trim()
                                        ? current.fares[passengerType].hasDiscount
                                        : false,
                                      unitDiscount: event.target.value.trim()
                                        ? current.fares[passengerType].unitDiscount
                                        : '0',
                                    },
                                  },
                                }))
                              }
                              aria-label={`${passengerType} unit sale price`}
                              aria-invalid={Boolean(saleError)}
                              className={fieldClass(Boolean(saleError))}
                              placeholder={
                                disabled
                                  ? 'Not used'
                                  : isStaffFamilyBooking
                                    ? 'Matches fare cost'
                                    : 'Package quote or 0.00'
                              }
                            />
                          </label>
                          {isStaffFamilyBooking ? (
                            <p className="col-span-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[11px] font-bold leading-4 text-emerald-900">
                              At-cost staff/family fare. Ordinary commission is waived; Low Fare
                              reprices the ticket under the staff/family fee policy and is never
                              paid as commission.
                            </p>
                          ) : (
                            <div className="col-span-2 text-[11px] font-bold text-slate-600">
                              <label className="mt-1 flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  checked={fare.hasDiscount}
                                  disabled={disabled || isSaving}
                                  onChange={(event) =>
                                    updateDraft((current) => ({
                                      ...current,
                                      fares: {
                                        ...current.fares,
                                        [passengerType]: {
                                          ...current.fares[passengerType],
                                          hasDiscount: event.target.checked,
                                          unitDiscount: event.target.checked
                                            ? current.fares[passengerType].unitDiscount
                                            : '0',
                                        },
                                      },
                                    }))
                                  }
                                  aria-label={`${passengerType} has discount`}
                                  className="h-4 w-4 rounded border-slate-300 text-[#8b1e2d] focus:ring-[#8b1e2d]"
                                />
                                Discount applied
                              </label>
                            </div>
                          )}
                          {!isStaffFamilyBooking && fare.hasDiscount && (
                            <label className="col-span-2 text-[11px] font-bold text-slate-600">
                              Discount per ticket (£)
                              <input
                                type="text"
                                inputMode="decimal"
                                value={fare.unitDiscount}
                                disabled={disabled || isSaving}
                                onChange={(event) =>
                                  updateDraft((current) => ({
                                    ...current,
                                    fares: {
                                      ...current.fares,
                                      [passengerType]: {
                                        ...current.fares[passengerType],
                                        unitDiscount: event.target.value,
                                      },
                                    },
                                  }))
                                }
                                aria-label={`${passengerType} unit discount`}
                                aria-invalid={Boolean(discountError)}
                                className={fieldClass(Boolean(discountError))}
                                placeholder="0.00"
                              />
                            </label>
                          )}
                        </>
                      ) : (
                        <p className="col-span-2 rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-[11px] font-bold text-amber-900">
                          Sale price and discount are added after this Held booking is issued.
                        </p>
                      )}
                    </div>
                    {(quantityError || costError || saleError || discountError) && (
                      <p id={fareErrorId} className="mt-2 text-xs font-semibold text-red-700">
                        {quantityError || costError || saleError || discountError}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <FieldError id="ticket-fares-error" message={errors.fares} />
          </fieldset>

          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <fieldset className="order-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-amber-900">
                Commission treatment
              </legend>
              <div className="grid gap-3">
                <label className="text-xs font-bold text-slate-700">
                  Booking treatment
                  <select
                    value={draft.commercialTreatment}
                    onChange={(event) => {
                      const commercialTreatment = event.target.value as TicketCommercialTreatment
                      updateDraft((current) => ({
                        ...current,
                        commercialTreatment,
                        commissionWaiverReason:
                          commercialTreatment === 'standard' ? '' : current.commissionWaiverReason,
                        fares:
                          commercialTreatment === 'staff_family'
                            ? (Object.fromEntries(
                                PASSENGER_TYPES.map((passengerType) => [
                                  passengerType,
                                  {
                                    ...current.fares[passengerType],
                                    unitSalePrice: current.fares[passengerType].unitSupplierCost,
                                    hasDiscount: false,
                                    unitDiscount: '0',
                                  },
                                ]),
                              ) as FareDraft)
                            : current.fares,
                      }))
                    }}
                    disabled={isSaving}
                    aria-label="Commission treatment"
                    className={fieldClass(false)}
                  >
                    <option value="standard">Standard commission</option>
                    <option value="staff_family">Staff/family — no ordinary commission</option>
                    <option value="commission_waived">Other no-commission booking</option>
                  </select>
                  <span className="mt-1 block text-[11px] font-medium leading-4 text-slate-500">
                    Staff/family bookings are sold at cost. A later Low Fare reprices the ticket
                    using the configured company fee; it does not create commission.
                  </span>
                </label>

                {draft.commercialTreatment !== 'standard' && (
                  <label className="text-xs font-bold text-slate-700">
                    {isStaffFamilyBooking ? 'Relationship / reason' : 'Waiver reason'}
                    <textarea
                      value={draft.commissionWaiverReason}
                      onChange={(event) =>
                        updateDraft((current) => ({
                          ...current,
                          commissionWaiverReason: event.target.value,
                        }))
                      }
                      maxLength={500}
                      rows={2}
                      disabled={isSaving}
                      aria-label="Commission waiver reason"
                      aria-invalid={Boolean(errors.commissionWaiverReason)}
                      aria-describedby={
                        errors.commissionWaiverReason
                          ? 'ticket-commission-waiver-reason-error'
                          : undefined
                      }
                      className={fieldClass(Boolean(errors.commissionWaiverReason))}
                      placeholder={
                        isStaffFamilyBooking
                          ? 'For example: father — staff family concession'
                          : 'Explain why no ordinary commission applies'
                      }
                    />
                    <FieldError
                      id="ticket-commission-waiver-reason-error"
                      message={errors.commissionWaiverReason}
                    />
                  </label>
                )}
              </div>
            </fieldset>

            <fieldset className="order-1 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
              <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-sky-900">
                Staff attribution
              </legend>
              <div className="grid gap-3">
                <label className="text-xs font-bold text-slate-700">
                  Responsible agent
                  <select
                    value={draft.responsibleEmployeeId}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        responsibleEmployeeId: event.target.value,
                        assistantEmployeeIds: current.assistantEmployeeIds.filter(
                          (id) => id !== event.target.value,
                        ),
                      }))
                    }
                    disabled={isSaving || !canManageAttribution}
                    aria-label="Responsible agent"
                    aria-invalid={Boolean(errors.responsibleEmployeeId)}
                    aria-describedby={
                      errors.responsibleEmployeeId ? 'ticket-responsible-agent-error' : undefined
                    }
                    className={fieldClass(Boolean(errors.responsibleEmployeeId))}
                  >
                    {attributionEmployees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.id === employeeId
                          ? `Me — ${employeeName || employee.fullName}`
                          : employee.fullName}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="ticket-responsible-agent-error"
                    message={errors.responsibleEmployeeId}
                  />
                  <span className="mt-1 block text-[11px] font-medium text-slate-500">
                    Issued passenger tickets count toward this agent&apos;s targets.
                  </span>
                </label>

                <div className="text-xs font-bold text-slate-700">
                  <label htmlFor="ticket-add-assistant">Assisted by (optional)</label>
                  <select
                    id="ticket-add-assistant"
                    value=""
                    onChange={(event) => {
                      const employeeIdToAdd = event.target.value
                      if (!employeeIdToAdd) return
                      updateDraft((current) => ({
                        ...current,
                        assistantEmployeeIds: current.assistantEmployeeIds.includes(employeeIdToAdd)
                          ? current.assistantEmployeeIds
                          : [...current.assistantEmployeeIds, employeeIdToAdd].slice(0, 10),
                      }))
                    }}
                    disabled={isSaving || draft.assistantEmployeeIds.length >= 10}
                    aria-label="Add assistant"
                    aria-invalid={Boolean(errors.assistantEmployeeIds)}
                    aria-describedby={
                      errors.assistantEmployeeIds ? 'ticket-assistant-agent-error' : undefined
                    }
                    className={fieldClass(Boolean(errors.assistantEmployeeIds))}
                  >
                    <option value="">
                      {draft.assistantEmployeeIds.length >= 10
                        ? 'Maximum 10 assistants reached'
                        : 'Add an assistant…'}
                    </option>
                    {attributionEmployees
                      .filter(
                        (employee) =>
                          employee.id !== draft.responsibleEmployeeId &&
                          !draft.assistantEmployeeIds.includes(employee.id),
                      )
                      .map((employee) => (
                        <option key={employee.id} value={employee.id}>
                          {employee.fullName}
                        </option>
                      ))}
                  </select>
                  <FieldError
                    id="ticket-assistant-agent-error"
                    message={errors.assistantEmployeeIds}
                  />
                  <span className="mt-1 block text-[11px] font-medium text-slate-500">
                    Assistance is recorded independently and never counts toward ticket targets.
                  </span>
                  {selectedAssistantEmployees.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2" aria-label="Selected assistants">
                      {selectedAssistantEmployees.map((employee) => (
                        <span
                          key={employee.id}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-sky-900 ring-1 ring-sky-200"
                        >
                          <UserRoundCheck className="h-3.5 w-3.5" aria-hidden="true" />
                          {employee.fullName}
                          <button
                            type="button"
                            onClick={() =>
                              updateDraft((current) => ({
                                ...current,
                                assistantEmployeeIds: current.assistantEmployeeIds.filter(
                                  (id) => id !== employee.id,
                                ),
                              }))
                            }
                            disabled={isSaving}
                            aria-label={`Remove ${employee.fullName} as assistant`}
                            className="ui-focus ml-0.5 rounded-full text-sky-700 hover:text-red-700 disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {attributionOverride && (
                <label className="mt-3 block text-xs font-bold text-slate-700">
                  Attribution reason
                  <textarea
                    value={draft.attributionReason}
                    onChange={(event) =>
                      updateDraft((current) => ({
                        ...current,
                        attributionReason: event.target.value,
                      }))
                    }
                    maxLength={500}
                    rows={2}
                    disabled={isSaving}
                    aria-label="Attribution reason"
                    aria-invalid={Boolean(errors.attributionReason)}
                    aria-describedby={
                      errors.attributionReason ? 'ticket-attribution-reason-error' : undefined
                    }
                    className={fieldClass(Boolean(errors.attributionReason))}
                    placeholder="For example: entered while the responsible agent was off sick"
                  />
                  <FieldError
                    id="ticket-attribution-reason-error"
                    message={errors.attributionReason}
                  />
                </label>
              )}
            </fieldset>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              {canManageAttribution
                ? 'Signed-in staff, branch, GBP and Unpaid are recorded automatically.'
                : 'Agent, branch, GBP and Unpaid are applied automatically.'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => reset()}
                disabled={isSaving}
                className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Eraser className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
              <button
                type="submit"
                aria-label={isSaving ? 'Saving TK' : 'Save TK'}
                disabled={isSaving || airlines.length === 0}
                className="ui-tap ui-focus inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white shadow-sm hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {isSaving ? 'Saving…' : 'Save TK'}
                {!isSaving && (
                  <span className="hidden text-[10px] opacity-75 sm:inline">⌘/Ctrl ↵</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      <ConfirmationDialog
        isOpen={Boolean(duplicate)}
        onClose={() => {
          if (isSaving) return
          setDuplicate(null)
          setPendingDuplicateInput(null)
        }}
        onConfirm={() => {
          if (!pendingDuplicateInput) return
          setDuplicate(null)
          void save({ ...pendingDuplicateInput, confirmDuplicate: true })
        }}
        title="Another TK uses this PNR"
        message={
          duplicate
            ? duplicate.customerName
              ? `${duplicate.customerName} already has TK record ${duplicate.pnr}. Create another TK record only if this is intentional.`
              : `A TK record already exists for PNR ${duplicate.pnr}. Create another TK record only if this is intentional.`
            : ''
        }
        confirmLabel="Create another TK"
        cancelLabel="Keep editing"
        type="warning"
        isLoading={isSaving}
      />
    </>
  )
}
