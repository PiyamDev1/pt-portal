'use client'

import { useRef, useState, type FormEvent } from 'react'
import {
  ArrowRightLeft,
  Calculator,
  CircleAlert,
  Eraser,
  Info,
  LoaderCircle,
  Search,
  Save,
  ShieldAlert,
  TicketCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import type { TicketingRecordRefundInput } from '@/lib/ticketing/refundContracts'
import {
  calculateTicketCancellation,
  calculateTicketReplacementAdjustment,
  formatGbpFromPence,
  parseGbpToPence,
  type TicketCancellationInput,
  type TicketCancellationResult,
  type TicketReplacementAdjustmentInput,
  type TicketReplacementAdjustmentResult,
} from '@/lib/ticketing/refundCalculator'
import type { TicketCompletionPassenger, TicketLedgerFare, TicketLedgerItem } from '../ledger/types'
import {
  loadRefundCalculatorTicketDetail,
  lookupRefundCalculatorTickets,
  lookupReplacementCalculatorTickets,
  RefundCalculatorLookupError,
  saveTicketRefund,
} from './refundCalculatorClientApi'

type FieldName =
  | 'ticketSalePrice'
  | 'supplierTicketCost'
  | 'airlineCancellationFee'
  | 'supplierCancellationCharge'
  | 'retainedAgentCommission'
  | 'desiredCompanyMarkup'

type Draft = Record<FieldName, string>
type Errors = Partial<Record<FieldName, string>>
type ReplacementFieldName =
  | 'supplierCost'
  | 'recordedSalePrice'
  | 'agentCommission'
  | 'desiredMarkup'
type ReplacementDraft = Record<ReplacementFieldName, string>
type ReplacementErrors = Partial<Record<ReplacementFieldName, string>>

const INITIAL_DRAFT: Draft = {
  ticketSalePrice: '',
  supplierTicketCost: '',
  airlineCancellationFee: '',
  supplierCancellationCharge: '0.00',
  retainedAgentCommission: '0.00',
  desiredCompanyMarkup: '0.00',
}

const INITIAL_REPLACEMENT_DRAFT: ReplacementDraft = {
  supplierCost: '',
  recordedSalePrice: '',
  agentCommission: '0.00',
  desiredMarkup: '0.00',
}

const REPLACEMENT_FIELDS: Array<{
  name: ReplacementFieldName
  label: string
  hint: string
}> = [
  {
    name: 'supplierCost',
    label: 'Replacement supplier cost',
    hint: 'Cost of the new passenger ticket from the supplier.',
  },
  {
    name: 'recordedSalePrice',
    label: 'Replacement sale price',
    hint: 'Total price charged for the new passenger ticket before applying this credit.',
  },
  {
    name: 'agentCommission',
    label: 'Replacement agent commission',
    hint: 'Temporary manual input until the Commission module supplies it.',
  },
  {
    name: 'desiredMarkup',
    label: 'Replacement company markup',
    hint: 'Use £0.00 for the minimum net-zero replacement price.',
  },
]

const FIELD_DEFINITIONS: Array<{
  name: FieldName
  label: string
  hint: string
  required?: boolean
}> = [
  {
    name: 'ticketSalePrice',
    label: 'Original ticket sale price',
    hint: 'Amount originally charged to the customer.',
    required: true,
  },
  {
    name: 'supplierTicketCost',
    label: 'Original supplier ticket cost',
    hint: 'Amount originally paid to the ticket supplier.',
    required: true,
  },
  {
    name: 'airlineCancellationFee',
    label: 'Airline cancellation fee',
    hint: 'Penalty retained by the airline.',
    required: true,
  },
  {
    name: 'supplierCancellationCharge',
    label: 'Supplier cancellation charge',
    hint: 'Additional charge from Sabre, Amadeus, PTAP or another supplier.',
  },
  {
    name: 'retainedAgentCommission',
    label: 'Retained agent commission',
    hint: 'Temporary manual input until this is supplied by the Commission module.',
  },
  {
    name: 'desiredCompanyMarkup',
    label: 'Desired company markup',
    hint: 'Use £0.00 to calculate the minimum net-zero cancellation charge.',
  },
]

function buildInput(draft: Draft): { input: TicketCancellationInput | null; errors: Errors } {
  const errors: Errors = {}
  const parsed = {} as Record<FieldName, number>

  for (const field of FIELD_DEFINITIONS) {
    const value = draft[field.name]
    const pence = parseGbpToPence(value)
    if (pence === null) {
      errors[field.name] =
        field.required && !value.trim() ? 'Required.' : 'Enter a valid GBP amount.'
    } else {
      parsed[field.name] = pence
    }
  }

  if (Object.keys(errors).length > 0) return { input: null, errors }
  return {
    input: {
      ticketSalePricePence: parsed.ticketSalePrice,
      supplierTicketCostPence: parsed.supplierTicketCost,
      airlineCancellationFeePence: parsed.airlineCancellationFee,
      supplierCancellationChargePence: parsed.supplierCancellationCharge,
      retainedAgentCommissionPence: parsed.retainedAgentCommission,
      desiredCompanyMarkupPence: parsed.desiredCompanyMarkup,
    },
    errors,
  }
}

function buildReplacementInput(
  draft: ReplacementDraft,
  cancellationCreditPence: number,
): { input: TicketReplacementAdjustmentInput | null; errors: ReplacementErrors } {
  const errors: ReplacementErrors = {}
  const parsed = {} as Record<ReplacementFieldName, number>
  for (const field of REPLACEMENT_FIELDS) {
    const value = draft[field.name]
    const pence = parseGbpToPence(value)
    if (pence === null) {
      errors[field.name] = !value.trim() ? 'Required.' : 'Enter a valid GBP amount.'
    } else {
      parsed[field.name] = pence
    }
  }
  if (Object.keys(errors).length > 0) return { input: null, errors }
  return {
    input: {
      cancellationCreditPence,
      replacementSupplierCostPence: parsed.supplierCost,
      replacementRecordedSalePricePence: parsed.recordedSalePrice,
      replacementAgentCommissionPence: parsed.agentCommission,
      desiredReplacementMarkupPence: parsed.desiredMarkup,
    },
    errors,
  }
}

function ResultValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{formatGbpFromPence(value)}</p>
    </div>
  )
}

function normalizedPnr(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

function sourceAmount(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : null
}

function fareSelectionKey(item: TicketLedgerItem, fare: TicketLedgerFare) {
  return `${item.transactionId}:${fare.passengerType}`
}

function passengerSelectionKey(passenger: TicketCompletionPassenger) {
  return `${passenger.passengerType}:${passenger.position}`
}

function newIdempotencyKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `ticket-refund-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function TicketCancellationCalculator() {
  const [draft, setDraft] = useState<Draft>(INITIAL_DRAFT)
  const [errors, setErrors] = useState<Errors>({})
  const [result, setResult] = useState<TicketCancellationResult | null>(null)
  const [pnr, setPnr] = useState('')
  const [tickets, setTickets] = useState<TicketLedgerItem[]>([])
  const [selectedFareKey, setSelectedFareKey] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [passengerOptions, setPassengerOptions] = useState<TicketCompletionPassenger[]>([])
  const [selectedPassengerKey, setSelectedPassengerKey] = useState('')
  const [isLoadingPassengers, setIsLoadingPassengers] = useState(false)
  const [settlementMode, setSettlementMode] = useState<'refund' | 'replacement'>('refund')
  const [replacementSource, setReplacementSource] = useState<'manual' | 'ledger'>('manual')
  const [replacementDraft, setReplacementDraft] =
    useState<ReplacementDraft>(INITIAL_REPLACEMENT_DRAFT)
  const [replacementErrors, setReplacementErrors] = useState<ReplacementErrors>({})
  const [replacementResult, setReplacementResult] =
    useState<TicketReplacementAdjustmentResult | null>(null)
  const [replacementPnr, setReplacementPnr] = useState('')
  const [replacementTickets, setReplacementTickets] = useState<TicketLedgerItem[]>([])
  const [replacementFareKey, setReplacementFareKey] = useState('')
  const [replacementPassengers, setReplacementPassengers] = useState<TicketCompletionPassenger[]>(
    [],
  )
  const [replacementPassengerKey, setReplacementPassengerKey] = useState('')
  const [replacementLookupError, setReplacementLookupError] = useState('')
  const [isLookingUpReplacement, setIsLookingUpReplacement] = useState(false)
  const [refundNotes, setRefundNotes] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const saveIdempotencyKey = useRef(newIdempotencyKey())

  const fareOptions = tickets.flatMap((ticket) =>
    ticket.fares.map((fare) => ({ ticket, fare, key: fareSelectionKey(ticket, fare) })),
  )
  const selectedFare = fareOptions.find((option) => option.key === selectedFareKey) || null

  const selectedPassenger =
    passengerOptions.find(
      (passenger) => passengerSelectionKey(passenger) === selectedPassengerKey,
    ) || null

  const replacementFareOptions = replacementTickets.flatMap((ticket) =>
    ticket.fares.map((fare) => ({ ticket, fare, key: fareSelectionKey(ticket, fare) })),
  )
  const selectedReplacementFare =
    replacementFareOptions.find((option) => option.key === replacementFareKey) || null
  const selectedReplacementPassenger =
    replacementPassengers.find(
      (passenger) => passengerSelectionKey(passenger) === replacementPassengerKey,
    ) || null

  const applyFareOption = async (option: (typeof fareOptions)[number]) => {
    setSelectedFareKey(option.key)
    setResult(null)
    setPassengerOptions([])
    setSelectedPassengerKey('')
    setIsLoadingPassengers(true)

    const salePrice = sourceAmount(option.fare.unitSalePrice)
    const supplierCost = sourceAmount(option.fare.unitSupplierCost)
    setDraft((current) => ({
      ...current,
      ...(salePrice === null ? {} : { ticketSalePrice: salePrice }),
      ...(supplierCost === null ? {} : { supplierTicketCost: supplierCost }),
    }))
    setErrors((current) => ({
      ...current,
      ticketSalePrice: salePrice === null ? 'Sale price is incomplete on this ticket.' : undefined,
      supplierTicketCost:
        supplierCost === null ? 'Supplier cost is incomplete on this ticket.' : undefined,
    }))
    try {
      const detail = await loadRefundCalculatorTicketDetail(option.ticket.bookingId)
      const passengers = detail.passengers.filter(
        (passenger) => passenger.passengerType === option.fare.passengerType,
      )
      if (passengers.length !== option.fare.quantity) {
        throw new RefundCalculatorLookupError(
          'Passenger details do not match the selected fare group. Complete the ticket details first.',
        )
      }
      setPassengerOptions(passengers)
      if (passengers.length === 1) {
        setSelectedPassengerKey(passengerSelectionKey(passengers[0]))
      }
    } catch (error) {
      setLookupError(
        error instanceof RefundCalculatorLookupError
          ? error.message
          : 'Unable to load that ticket’s passenger details.',
      )
    } finally {
      setIsLoadingPassengers(false)
    }
  }

  const applyFare = (key: string) => {
    const option = fareOptions.find((candidate) => candidate.key === key)
    if (!option) {
      setSelectedFareKey('')
      setPassengerOptions([])
      setSelectedPassengerKey('')
      return
    }
    setLookupError('')
    void applyFareOption(option)
  }

  const lookupTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalized = normalizedPnr(pnr)
    if (!normalized) {
      setLookupError('Enter an exact PNR.')
      setTickets([])
      setSelectedFareKey('')
      return
    }

    setPnr(normalized)
    setIsLookingUp(true)
    setLookupError('')
    setTickets([])
    setSelectedFareKey('')
    setPassengerOptions([])
    setSelectedPassengerKey('')
    try {
      const matches = await lookupRefundCalculatorTickets(normalized)
      setTickets(matches)
      if (matches.length === 0) {
        setLookupError('No issued TK ticket with that exact PNR is visible in your ledger.')
        return
      }
      const options = matches.flatMap((ticket) =>
        ticket.fares.map((fare) => ({ ticket, fare, key: fareSelectionKey(ticket, fare) })),
      )
      if (options.length === 1) {
        const option = options[0]
        await applyFareOption(option)
      }
    } catch (error) {
      setLookupError(
        error instanceof RefundCalculatorLookupError
          ? error.message
          : 'Unable to find that ticket right now.',
      )
    } finally {
      setIsLookingUp(false)
    }
  }

  const applyReplacementFareOption = async (option: (typeof replacementFareOptions)[number]) => {
    setReplacementFareKey(option.key)
    setReplacementResult(null)
    setReplacementPassengers([])
    setReplacementPassengerKey('')
    setReplacementLookupError('')

    const supplierCost = sourceAmount(option.fare.unitSupplierCost)
    const salePrice = sourceAmount(option.fare.unitSalePrice)
    setReplacementDraft((current) => ({
      ...current,
      ...(supplierCost === null ? {} : { supplierCost }),
      ...(salePrice === null ? {} : { recordedSalePrice: salePrice }),
    }))
    setReplacementErrors((current) => ({
      ...current,
      supplierCost:
        supplierCost === null ? 'Supplier cost is incomplete on this ticket.' : undefined,
      recordedSalePrice:
        salePrice === null ? 'Sale price is incomplete on this ticket.' : undefined,
    }))

    try {
      const detail = await loadRefundCalculatorTicketDetail(option.ticket.bookingId)
      const passengers = detail.passengers.filter(
        (passenger) => passenger.passengerType === option.fare.passengerType,
      )
      if (passengers.length !== option.fare.quantity) {
        throw new RefundCalculatorLookupError(
          'Passenger details do not match the selected replacement fare group. Complete the ticket details first.',
        )
      }
      setReplacementPassengers(passengers)
      if (passengers.length === 1) {
        setReplacementPassengerKey(passengerSelectionKey(passengers[0]))
      }
    } catch (error) {
      setReplacementLookupError(
        error instanceof RefundCalculatorLookupError
          ? error.message
          : 'Unable to load the replacement passenger details.',
      )
    }
  }

  const applyReplacementFare = (key: string) => {
    const option = replacementFareOptions.find((candidate) => candidate.key === key)
    if (!option) {
      setReplacementFareKey('')
      setReplacementPassengers([])
      setReplacementPassengerKey('')
      return
    }
    void applyReplacementFareOption(option)
  }

  const lookupReplacementTicket = async () => {
    const normalized = normalizedPnr(replacementPnr)
    if (!normalized) {
      setReplacementLookupError('Enter the exact replacement PNR.')
      return
    }

    setReplacementPnr(normalized)
    setIsLookingUpReplacement(true)
    setReplacementLookupError('')
    setReplacementTickets([])
    setReplacementFareKey('')
    setReplacementPassengers([])
    setReplacementPassengerKey('')
    try {
      const matches = (await lookupReplacementCalculatorTickets(normalized)).filter(
        (ticket) => ticket.bookingId !== selectedFare?.ticket.bookingId,
      )
      setReplacementTickets(matches)
      if (matches.length === 0) {
        setReplacementLookupError(
          'No different Held or Issued TK booking with that exact PNR is visible in the ledger.',
        )
        return
      }
      const options = matches.flatMap((ticket) =>
        ticket.fares.map((fare) => ({ ticket, fare, key: fareSelectionKey(ticket, fare) })),
      )
      if (options.length === 1) await applyReplacementFareOption(options[0])
    } catch (error) {
      setReplacementLookupError(
        error instanceof RefundCalculatorLookupError
          ? error.message
          : 'Unable to find the replacement ticket.',
      )
    } finally {
      setIsLookingUpReplacement(false)
    }
  }

  const calculate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (selectedFare && !selectedPassenger) {
      setLookupError('Select the exact passenger ticket before calculating this linked preview.')
      setResult(null)
      return
    }
    const next = buildInput(draft)
    setErrors(next.errors)
    const cancellationResult = next.input ? calculateTicketCancellation(next.input) : null
    setResult(cancellationResult)
    if (settlementMode !== 'replacement' || !cancellationResult) {
      setReplacementResult(null)
      return
    }
    if (replacementSource === 'ledger' && !selectedReplacementFare) {
      setReplacementLookupError('Select the replacement passenger fare before calculating.')
      setReplacementResult(null)
      return
    }
    if (replacementSource === 'ledger' && !selectedReplacementPassenger) {
      setReplacementLookupError(
        'Select the exact replacement passenger ticket before calculating this linked preview.',
      )
      setReplacementResult(null)
      return
    }
    const replacement = buildReplacementInput(
      replacementDraft,
      cancellationResult.customerRefundPence,
    )
    setReplacementErrors(replacement.errors)
    setReplacementResult(
      replacement.input ? calculateTicketReplacementAdjustment(replacement.input) : null,
    )
  }

  const saveRefund = async () => {
    if (!result || !selectedFare || !selectedPassenger || isSaving) return
    const parsed = buildInput(draft)
    if (!parsed.input) {
      setErrors(parsed.errors)
      setSaveError('Review the cancellation values before saving.')
      return
    }
    if (settlementMode === 'replacement' && !replacementResult) {
      setSaveError('Calculate the replacement advice before saving.')
      return
    }
    const replacementValues = buildReplacementInput(replacementDraft, result.customerRefundPence)
    if (settlementMode === 'replacement' && !replacementValues.input) {
      setReplacementErrors(replacementValues.errors)
      setSaveError('Review the replacement values before saving.')
      return
    }

    const cancellation = parsed.input
    const replacement = replacementValues.input
    const input: TicketingRecordRefundInput = {
      bookingId: selectedFare.ticket.bookingId,
      passengerType: selectedPassenger.passengerType,
      passengerPosition: selectedPassenger.position,
      settlementMode,
      replacement:
        settlementMode === 'refund' || !replacement
          ? null
          : replacementSource === 'ledger' &&
              selectedReplacementFare &&
              selectedReplacementPassenger
            ? {
                source: 'ledger',
                bookingId: selectedReplacementFare.ticket.bookingId,
                passengerType: selectedReplacementPassenger.passengerType,
                passengerPosition: selectedReplacementPassenger.position,
                agentCommissionGbp: replacement.replacementAgentCommissionPence / 100,
                desiredMarkupGbp: replacement.desiredReplacementMarkupPence / 100,
              }
            : {
                source: 'manual',
                supplierCostGbp: replacement.replacementSupplierCostPence / 100,
                salePriceGbp: replacement.replacementRecordedSalePricePence / 100,
                agentCommissionGbp: replacement.replacementAgentCommissionPence / 100,
                desiredMarkupGbp: replacement.desiredReplacementMarkupPence / 100,
              },
      airlineCancellationFeeGbp: cancellation.airlineCancellationFeePence / 100,
      supplierCancellationChargeGbp: cancellation.supplierCancellationChargePence / 100,
      retainedAgentCommissionGbp: cancellation.retainedAgentCommissionPence / 100,
      desiredCompanyMarkupGbp: cancellation.desiredCompanyMarkupPence / 100,
      notes: refundNotes.trim() || null,
      overrideReason: overrideReason.trim() || null,
    }
    setIsSaving(true)
    setSaveError('')
    try {
      const saved = await saveTicketRefund(input, saveIdempotencyKey.current)
      toast.success(saved.idempotentReplay ? 'Refund was already saved.' : 'Refund saved.')
      saveIdempotencyKey.current = newIdempotencyKey()
    } catch (error) {
      setSaveError(
        error instanceof RefundCalculatorLookupError
          ? error.message
          : 'Unable to save this Refund.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  const clear = () => {
    setDraft(INITIAL_DRAFT)
    setErrors({})
    setResult(null)
    setPnr('')
    setTickets([])
    setSelectedFareKey('')
    setLookupError('')
    setPassengerOptions([])
    setSelectedPassengerKey('')
    setSettlementMode('refund')
    setReplacementSource('manual')
    setReplacementDraft(INITIAL_REPLACEMENT_DRAFT)
    setReplacementErrors({})
    setReplacementResult(null)
    setReplacementPnr('')
    setReplacementTickets([])
    setReplacementFareKey('')
    setReplacementPassengers([])
    setReplacementPassengerKey('')
    setReplacementLookupError('')
    setRefundNotes('')
    setOverrideReason('')
    setSaveError('')
    saveIdempotencyKey.current = newIdempotencyKey()
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#4b0f16] via-[#8b1e2d] to-slate-900 p-5 text-white shadow-xl shadow-red-950/15 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-red-100">
              Cancellation preview
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">
              Ticket Cancellation Calculator
            </h1>
            <p className="mt-2 text-sm leading-6 text-red-50/85 md:text-base">
              Work out the charge required to protect company costs and the proposed refund due to
              the customer.
            </p>
          </div>
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Calculator className="h-8 w-8" aria-hidden="true" />
          </span>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Ticket lookup
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Prefill from the ledger</h2>
              <p className="mt-1 text-sm text-slate-500">
                Find an issued TK by exact PNR, then select one passenger-fare group.
              </p>
            </div>

            <form onSubmit={(event) => void lookupTicket(event)} className="mt-4 flex gap-2">
              <label className="min-w-0 flex-1 text-xs font-bold text-slate-700">
                Exact PNR
                <input
                  value={pnr}
                  onChange={(event) => {
                    setPnr(event.target.value.toUpperCase())
                    setLookupError('')
                  }}
                  aria-label="Exact PNR for cancellation"
                  autoComplete="off"
                  maxLength={20}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm font-bold uppercase text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  placeholder="ABC123"
                />
              </label>
              <button
                type="submit"
                disabled={isLookingUp}
                className="ui-tap ui-focus mt-5 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-black text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60"
              >
                {isLookingUp ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
                Find ticket
              </button>
            </form>

            {lookupError && (
              <p role="alert" className="mt-3 text-xs font-semibold text-red-700">
                {lookupError}
              </p>
            )}

            {fareOptions.length > 0 && (
              <div className="mt-4">
                <label className="text-xs font-bold text-slate-700">
                  Passenger fare to cancel
                  <select
                    value={selectedFareKey}
                    onChange={(event) => applyFare(event.target.value)}
                    aria-label="Passenger fare to cancel"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                  >
                    <option value="">Select passenger fare</option>
                    {fareOptions.map(({ ticket, fare, key }) => (
                      <option key={key} value={key}>
                        {ticket.pnr} · {ticket.airline.iataCode} · {fare.passengerType} ·{' '}
                        {fare.quantity} ticket{fare.quantity === 1 ? '' : 's'} ·{' '}
                        {ticket.customerName}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedFare && (
                  <div className="mt-3 space-y-3">
                    {isLoadingPassengers ? (
                      <p
                        role="status"
                        className="flex items-center gap-2 text-xs font-semibold text-slate-500"
                      >
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Loading passenger tickets…
                      </p>
                    ) : passengerOptions.length > 0 ? (
                      <label className="text-xs font-bold text-slate-700">
                        Exact passenger ticket
                        <select
                          value={selectedPassengerKey}
                          onChange={(event) => {
                            setSelectedPassengerKey(event.target.value)
                            setLookupError('')
                            setResult(null)
                          }}
                          aria-label="Exact passenger ticket"
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#8b1e2d] focus:ring-2 focus:ring-red-100"
                        >
                          <option value="">Select passenger ticket</option>
                          {passengerOptions.map((passenger) => (
                            <option
                              key={passengerSelectionKey(passenger)}
                              value={passengerSelectionKey(passenger)}
                            >
                              {passenger.passengerType} #{passenger.position} ·{' '}
                              {passenger.fullName || 'Name incomplete'} ·{' '}
                              {passenger.ticketNumber || 'Ticket number incomplete'}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {selectedPassenger && (
                      <div className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-900 ring-1 ring-emerald-200">
                        <TicketCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        <p>
                          Prefilled {selectedPassenger.passengerType} #{selectedPassenger.position}{' '}
                          from <strong>{selectedFare.ticket.pnr}</strong>
                          {selectedPassenger.ticketNumber
                            ? ` · Ticket ${selectedPassenger.ticketNumber}`
                            : ''}
                          . Review the values before calculating; no refund is saved.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <form
            aria-label="Ticket cancellation calculator"
            onSubmit={calculate}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
          >
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                Inputs
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">Cancellation values</h2>
              <p className="mt-1 text-sm text-slate-500">
                All amounts are per passenger ticket in GBP.
              </p>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {FIELD_DEFINITIONS.map((field) => {
                const error = errors[field.name]
                const errorId = `${field.name}-error`
                const hintId = `${field.name}-hint`
                return (
                  <label key={field.name} className="text-xs font-bold text-slate-700">
                    {field.label}
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-slate-400">
                        £
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={draft[field.name]}
                        onChange={(event) => {
                          const value = event.target.value
                          setDraft((current) => ({ ...current, [field.name]: value }))
                          setErrors((current) => ({ ...current, [field.name]: undefined }))
                          setResult(null)
                        }}
                        aria-label={field.label}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? errorId : hintId}
                        className={`w-full rounded-xl border bg-white py-2.5 pl-7 pr-3 text-sm font-semibold text-slate-900 outline-none transition focus:ring-2 ${
                          error
                            ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                            : 'border-slate-300 focus:border-[#8b1e2d] focus:ring-red-100'
                        }`}
                        placeholder="0.00"
                      />
                    </div>
                    {error ? (
                      <span
                        id={errorId}
                        className="mt-1 block text-[11px] font-semibold text-red-700"
                      >
                        {error}
                      </span>
                    ) : (
                      <span
                        id={hintId}
                        className="mt-1 block text-[11px] font-medium leading-4 text-slate-500"
                      >
                        {field.hint}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            <fieldset className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/60 p-4">
              <legend className="px-1 text-xs font-black uppercase tracking-[0.14em] text-violet-900">
                Customer settlement
              </legend>
              <p className="text-sm font-black text-slate-950">
                Should this value be adjusted against a replacement ticket?
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                  <input
                    type="radio"
                    name="settlement-mode"
                    value="refund"
                    aria-label="Refund the customer"
                    checked={settlementMode === 'refund'}
                    onChange={() => {
                      setSettlementMode('refund')
                      setReplacementResult(null)
                      setResult(null)
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="block text-slate-900">Refund the customer</strong>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Show the customer refund after all cancellation charges.
                    </span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200">
                  <input
                    type="radio"
                    name="settlement-mode"
                    value="replacement"
                    aria-label="Use toward another ticket"
                    checked={settlementMode === 'replacement'}
                    onChange={() => {
                      setSettlementMode('replacement')
                      setResult(null)
                      setReplacementResult(null)
                    }}
                    className="mt-0.5"
                  />
                  <span>
                    <strong className="block text-slate-900">Use toward another ticket</strong>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Calculate the safe replacement price and any extra amount to collect.
                    </span>
                  </span>
                </label>
              </div>

              {settlementMode === 'replacement' && (
                <div className="mt-4 space-y-4 border-t border-violet-200 pt-4">
                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900 ring-1 ring-amber-200">
                    Do not treat unconfirmed airline recovery as available value. Confirm how the
                    original airline will settle first. Cash recovery may fund any replacement;
                    airline credit or a voucher must stay with the same airline and must be valid
                    for the intended passenger and travel dates.
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="radio"
                        name="replacement-source"
                        value="manual"
                        aria-label="Enter replacement costs manually"
                        checked={replacementSource === 'manual'}
                        onChange={() => {
                          setReplacementSource('manual')
                          setReplacementResult(null)
                        }}
                      />
                      Enter replacement costs manually
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="radio"
                        name="replacement-source"
                        value="ledger"
                        aria-label="Select an existing booking"
                        checked={replacementSource === 'ledger'}
                        onChange={() => {
                          setReplacementSource('ledger')
                          setReplacementResult(null)
                        }}
                      />
                      Select an existing booking
                    </label>
                  </div>

                  {replacementSource === 'ledger' && (
                    <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-violet-200">
                      <div className="flex gap-2">
                        <label className="min-w-0 flex-1 text-xs font-bold text-slate-700">
                          Exact replacement PNR
                          <input
                            value={replacementPnr}
                            onChange={(event) =>
                              setReplacementPnr(event.target.value.toUpperCase())
                            }
                            aria-label="Exact replacement PNR"
                            maxLength={20}
                            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm font-bold uppercase outline-none focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                            placeholder="XYZ789"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => void lookupReplacementTicket()}
                          disabled={isLookingUpReplacement}
                          className="ui-tap ui-focus mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-900 px-4 text-sm font-black text-white disabled:opacity-50"
                        >
                          {isLookingUpReplacement ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Search className="h-4 w-4" aria-hidden="true" />
                          )}
                          Find booking
                        </button>
                      </div>

                      {replacementFareOptions.length > 0 && (
                        <label className="block text-xs font-bold text-slate-700">
                          Replacement passenger fare
                          <select
                            value={replacementFareKey}
                            onChange={(event) => applyReplacementFare(event.target.value)}
                            aria-label="Replacement passenger fare"
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                          >
                            <option value="">Select replacement fare</option>
                            {replacementFareOptions.map(({ ticket, fare, key }) => (
                              <option key={key} value={key}>
                                {ticket.pnr} · {ticket.airline.iataCode} · {fare.passengerType} ·{' '}
                                {fare.quantity} ticket{fare.quantity === 1 ? '' : 's'} ·{' '}
                                {ticket.customerName}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {replacementPassengers.length > 1 && (
                        <label className="block text-xs font-bold text-slate-700">
                          Exact replacement passenger
                          <select
                            value={replacementPassengerKey}
                            onChange={(event) => setReplacementPassengerKey(event.target.value)}
                            aria-label="Exact replacement passenger"
                            className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:border-violet-700 focus:ring-2 focus:ring-violet-100"
                          >
                            <option value="">Select passenger</option>
                            {replacementPassengers.map((passenger) => (
                              <option
                                key={passengerSelectionKey(passenger)}
                                value={passengerSelectionKey(passenger)}
                              >
                                {passenger.passengerType} #{passenger.position} ·{' '}
                                {passenger.fullName || 'Name incomplete'} ·{' '}
                                {passenger.ticketNumber || 'Ticket number incomplete'}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {selectedReplacementFare &&
                        selectedFare &&
                        selectedReplacementFare.ticket.airline.id !==
                          selectedFare.ticket.airline.id && (
                          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900 ring-1 ring-amber-200">
                            The replacement uses a different airline. Only proceed if the original
                            airline is returning cash. Airline credit or a voucher must stay with
                            the same airline.
                          </div>
                        )}

                      {selectedReplacementPassenger && (
                        <p className="text-xs font-semibold text-emerald-700">
                          Linked to {selectedReplacementPassenger.passengerType} #
                          {selectedReplacementPassenger.position}
                          {selectedReplacementPassenger.ticketNumber
                            ? ` · Ticket ${selectedReplacementPassenger.ticketNumber}`
                            : ''}
                        </p>
                      )}

                      {replacementLookupError && (
                        <p role="alert" className="text-xs font-semibold text-red-700">
                          {replacementLookupError}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    {REPLACEMENT_FIELDS.map((field) => {
                      const error = replacementErrors[field.name]
                      return (
                        <label key={field.name} className="text-xs font-bold text-slate-700">
                          {field.label}
                          <div className="relative mt-1">
                            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-slate-400">
                              £
                            </span>
                            <input
                              value={replacementDraft[field.name]}
                              onChange={(event) => {
                                setReplacementDraft((current) => ({
                                  ...current,
                                  [field.name]: event.target.value,
                                }))
                                setReplacementErrors((current) => ({
                                  ...current,
                                  [field.name]: undefined,
                                }))
                                setReplacementResult(null)
                              }}
                              type="text"
                              inputMode="decimal"
                              aria-label={field.label}
                              aria-invalid={Boolean(error)}
                              className={`w-full rounded-xl border bg-white py-2.5 pl-7 pr-3 text-sm font-semibold outline-none focus:ring-2 ${
                                error
                                  ? 'border-red-300 focus:border-red-500 focus:ring-red-100'
                                  : 'border-slate-300 focus:border-violet-700 focus:ring-violet-100'
                              }`}
                              placeholder="0.00"
                            />
                          </div>
                          <span
                            className={`mt-1 block text-[11px] font-medium leading-4 ${
                              error ? 'text-red-700' : 'text-slate-500'
                            }`}
                          >
                            {error || field.hint}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </fieldset>

            <div className="mt-5 rounded-xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 ring-1 ring-amber-200">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  Retained commission is stored as a manual, auditable snapshot until the separate
                  Commission module can supply the posted value.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="submit"
                className="ui-tap ui-focus inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white hover:bg-[#6f1724]"
              >
                <Calculator className="h-4 w-4" aria-hidden="true" />
                Calculate refund
              </button>
              <button
                type="button"
                onClick={clear}
                className="ui-tap ui-focus inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-700 hover:bg-slate-50"
              >
                <Eraser className="h-4 w-4" aria-hidden="true" />
                Clear
              </button>
            </div>
          </form>
        </div>

        <section
          aria-live="polite"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">Preview</p>
          <h2 className="mt-1 text-xl font-black text-slate-950">Cancellation outcome</h2>

          {!result ? (
            <div className="mt-5 flex min-h-80 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <CircleAlert className="h-9 w-9 text-slate-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-slate-700">
                Enter the ticket values to calculate.
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                This is an estimate only. Nothing is saved and no ticket status is changed.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {result.requiresManagerReview && (
                <div
                  role="alert"
                  className="rounded-xl bg-red-50 p-4 text-red-900 ring-1 ring-red-200"
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-black">Manager/Admin review required</p>
                      <p className="mt-1 text-xs leading-5">
                        The proposed charge exceeds the recorded sale price by{' '}
                        {formatGbpFromPence(result.customerRefundShortfallPence)}. The customer
                        refund is held at £0.00 rather than showing a negative amount.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <ResultValue
                  label="Minimum charge for net £0"
                  value={result.minimumCancellationChargePence}
                />
                <ResultValue
                  label="Proposed cancellation charge"
                  value={result.totalCancellationChargePence}
                />
                <ResultValue label="Customer refund" value={result.customerRefundPence} />
                <ResultValue
                  label="Expected airline recovery"
                  value={result.expectedAirlineRecoveryPence}
                />
                <ResultValue
                  label="Expected company result"
                  value={result.expectedCompanyResultPence}
                />
                <ResultValue
                  label="Original ticket margin"
                  value={result.originalCompanyMarginPence}
                />
              </div>

              <div className="rounded-xl bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-900 ring-1 ring-sky-200">
                Expected company result assumes the airline recovery and customer refund settle at
                these values with no additional costs. Actual profit or loss remains pending until
                settlement is recorded.
              </div>

              {settlementMode === 'replacement' && replacementResult && (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <div className="flex items-center gap-2">
                    <ArrowRightLeft className="h-5 w-5 text-violet-800" aria-hidden="true" />
                    <h3 className="text-base font-black text-slate-950">
                      Replacement-ticket advice
                    </h3>
                  </div>

                  {replacementResult.requiresManagerReview ? (
                    <div
                      role="alert"
                      className="rounded-xl bg-red-50 p-4 text-red-900 ring-1 ring-red-200"
                    >
                      <p className="text-sm font-black">
                        Do not proceed at the recorded sale price
                      </p>
                      <p className="mt-1 text-xs leading-5">
                        {replacementResult.companyLossAtRecordedSalePence > 0
                          ? `The recorded price makes the company absorb ${formatGbpFromPence(
                              replacementResult.companyLossAtRecordedSalePence,
                            )}. `
                          : 'The recorded price covers direct replacement costs but misses the desired company result. '}
                        It is{' '}
                        {formatGbpFromPence(replacementResult.desiredCompanyResultShortfallPence)}{' '}
                        below the safe price. Charge at least{' '}
                        {formatGbpFromPence(replacementResult.minimumSafeReplacementSalePence)} in
                        total and collect at least{' '}
                        {formatGbpFromPence(
                          replacementResult.minimumAdditionalCustomerPaymentPence,
                        )}{' '}
                        after applying the available cancellation value, or obtain Manager/Admin
                        approval for the reduced result.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-emerald-50 p-4 text-emerald-900 ring-1 ring-emerald-200">
                      <p className="text-sm font-black">
                        Recorded replacement price protects costs
                      </p>
                      <p className="mt-1 text-xs leading-5">
                        Apply{' '}
                        {formatGbpFromPence(
                          replacementResult.recordedCancellationCreditAppliedPence,
                        )}{' '}
                        of cancellation value and collect{' '}
                        {formatGbpFromPence(
                          replacementResult.recordedAdditionalCustomerPaymentPence,
                        )}{' '}
                        from the customer. Any remaining customer credit must be refunded or kept as
                        a separately tracked balance; it is not company profit.
                      </p>
                    </div>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <ResultValue
                      label="Cancellation value available"
                      value={result.customerRefundPence}
                    />
                    <ResultValue
                      label="Minimum net-zero replacement price"
                      value={replacementResult.minimumNetZeroReplacementSalePence}
                    />
                    <ResultValue
                      label="Minimum safe replacement price"
                      value={replacementResult.minimumSafeReplacementSalePence}
                    />
                    <ResultValue
                      label="Minimum extra customer payment"
                      value={replacementResult.minimumAdditionalCustomerPaymentPence}
                    />
                    <ResultValue
                      label="Credit left at safe price"
                      value={replacementResult.customerCreditRemainingAtSafePricePence}
                    />
                    <ResultValue
                      label="Credit applied at recorded price"
                      value={replacementResult.recordedCancellationCreditAppliedPence}
                    />
                    <ResultValue
                      label="Extra due at recorded price"
                      value={replacementResult.recordedAdditionalCustomerPaymentPence}
                    />
                    <ResultValue
                      label="Credit left at recorded price"
                      value={replacementResult.recordedCustomerCreditRemainingPence}
                    />
                    <ResultValue
                      label="Recorded replacement result"
                      value={replacementResult.recordedReplacementResultPence}
                    />
                  </div>

                  <p className="rounded-xl bg-violet-50 px-4 py-3 text-xs leading-5 text-violet-900 ring-1 ring-violet-200">
                    Safe replacement price = supplier cost + replacement agent commission + desired
                    replacement markup. The Commission module will replace the temporary manual
                    commission input in the saved workflow.
                  </p>
                </div>
              )}

              {selectedFare &&
                selectedPassenger &&
                (settlementMode === 'refund' || replacementResult) && (
                  <div className="space-y-3 border-t border-slate-200 pt-4">
                    <div>
                      <h3 className="text-base font-black text-slate-950">Save this Refund</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-600">
                        Saves the reviewed formula against {selectedFare.ticket.pnr} and passenger{' '}
                        {selectedPassenger.passengerType} #{selectedPassenger.position}. Package
                        scope is checked again from the package PNR when saved.
                      </p>
                    </div>
                    <label className="block text-xs font-bold text-slate-700">
                      Notes
                      <textarea
                        value={refundNotes}
                        onChange={(event) => setRefundNotes(event.target.value)}
                        maxLength={2000}
                        rows={2}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                    {(result.requiresManagerReview || replacementResult?.requiresManagerReview) && (
                      <label className="block text-xs font-bold text-red-800">
                        Manager/Admin override reason
                        <textarea
                          value={overrideReason}
                          onChange={(event) => setOverrideReason(event.target.value)}
                          maxLength={500}
                          rows={2}
                          className="mt-1 w-full rounded-xl border border-red-300 px-3 py-2 text-sm"
                        />
                        <span className="mt-1 block font-medium">
                          Only Admin, Master Admin or Super Admin can save a reduced-result
                          override.
                        </span>
                      </label>
                    )}
                    {saveError && (
                      <p role="alert" className="text-xs font-semibold text-red-700">
                        {saveError}
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void saveRefund()}
                      disabled={isSaving}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-5 text-sm font-black text-white disabled:opacity-50"
                    >
                      {isSaving ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="h-4 w-4" aria-hidden="true" />
                      )}
                      Save Refund snapshot
                    </button>
                  </div>
                )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
