'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Loader2,
  MapPin,
  PlaneTakeoff,
  Plus,
  Save,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmationDialog, DrawerBase } from '@/components'
import type {
  TicketingAirportOption,
  TicketingItineraryAirline,
  TicketingItineraryResponse,
  TicketingReplaceItineraryInput,
} from '@/lib/ticketing/itineraryContracts'
import { TICKET_ITINERARY_MAX_SECTORS } from '@/lib/ticketing/itineraryContracts'
import {
  loadTicketAirports,
  loadTicketItinerary,
  replaceTicketItinerary,
  TicketItineraryApiError,
} from './itineraryClientApi'
import type { TicketAirlineOption, TicketLedgerItem } from './types'

type SectorDraft = {
  key: string
  airlineId: string
  flightNumber: string
  originIata: string
  destinationIata: string
  departureLocal: string
  arrivalLocal: string
}

type ItineraryDraft = {
  adminReason: string
  sectors: SectorDraft[]
}

type ItineraryErrors = Record<string, string>

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const FLIGHT_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9 -]*$/

function newRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}`
}

function newSectorKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `sector-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function blankSector(previous?: SectorDraft): SectorDraft {
  return {
    key: newSectorKey(),
    airlineId: previous?.airlineId || '',
    flightNumber: '',
    originIata: previous?.destinationIata || '',
    destinationIata: '',
    departureLocal: '',
    arrivalLocal: '',
  }
}

function draftFromResponse(response: TicketingItineraryResponse): ItineraryDraft {
  return {
    adminReason: '',
    sectors:
      response.sectors.length > 0
        ? response.sectors.map((sector) => ({
            key: sector.id,
            airlineId: sector.airline.id,
            flightNumber: sector.flightNumber,
            originIata: sector.originIata,
            destinationIata: sector.destinationIata,
            departureLocal: sector.departureLocal,
            arrivalLocal: sector.arrivalLocal || '',
          }))
        : [blankSector()],
  }
}

function fieldClass(hasError: boolean) {
  return `mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 ${
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

function AirportCodeField({
  label,
  value,
  airport,
  listId,
  ariaLabel,
  errorId,
  errorMessage,
  onChange,
  onAirportsLoaded,
}: {
  label: string
  value: string
  airport?: TicketingAirportOption
  listId: string
  ariaLabel: string
  errorId: string
  errorMessage?: string
  onChange: (value: string) => void
  onAirportsLoaded: (airports: TicketingAirportOption[]) => void
}) {
  const [isSearching, setIsSearching] = useState(false)
  const [lookupError, setLookupError] = useState('')
  const hintId = `${errorId}-hint`

  useEffect(() => {
    const query = value.trim().toUpperCase()
    if (query.length < 2 || airport?.iataCode === query) return

    const controller = new AbortController()
    const timeout = window.setTimeout(
      () => {
        const lookup =
          query.length === 3 ? { codes: [query] } : { query, limit: 20 }
        void loadTicketAirports(lookup, controller.signal)
          .then((options) => {
            onAirportsLoaded(options)
            if (query.length === 3 && !options.some((option) => option.iataCode === query)) {
              setLookupError(`No active airport found for ${query}.`)
            } else if (options.length === 0) {
              setLookupError(`No airports found starting with ${query}.`)
            }
          })
          .catch((caught) => {
            if (controller.signal.aborted) return
            setLookupError(
              caught instanceof TicketItineraryApiError
                ? caught.message
                : 'Unable to search the airport directory.',
            )
          })
          .finally(() => {
            if (!controller.signal.aborted) setIsSearching(false)
          })
      },
      query.length === 3 ? 0 : 250,
    )

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [airport?.iataCode, onAirportsLoaded, value])

  const hint = airport
    ? `${airport.city} · ${airport.timezone}`
    : isSearching
      ? 'Searching the stored airport directory…'
      : lookupError ||
        (value.length < 2
          ? 'Type at least two letters of the IATA code.'
          : 'Choose a matching three-letter airport code.')

  return (
    <label className="text-xs font-bold text-slate-700">
      {label}
      <input
        list={listId}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
            .toUpperCase()
            .replace(/[^A-Z]/g, '')
            .slice(0, 3)
          setLookupError('')
          setIsSearching(nextValue.length >= 2 && airport?.iataCode !== nextValue)
          onChange(nextValue)
        }}
        maxLength={3}
        autoComplete="off"
        spellCheck={false}
        required
        aria-label={ariaLabel}
        aria-busy={isSearching}
        aria-invalid={Boolean(errorMessage)}
        aria-describedby={`${hintId}${errorMessage ? ` ${errorId}` : ''}`}
        className={`${fieldClass(Boolean(errorMessage))} font-mono uppercase`}
        placeholder={label === 'Origin airport' ? 'LHR' : 'IST'}
      />
      <span id={hintId} className="mt-1 block text-[11px] font-semibold text-slate-500">
        {hint}
      </span>
      <FieldError id={errorId} message={errorMessage} />
    </label>
  )
}

function validLocalDateTime(value: string) {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value)
  if (!match) return false
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '00'] = match
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number)
  const [year, month, day, hour, minute, second] = parts
  if (year < 2000 || year > 2200 || hour > 23 || minute > 59 || second > 59) return false
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  )
}

function mergeAirlines(
  ledgerAirlines: TicketAirlineOption[],
  response: TicketingItineraryResponse,
): TicketingItineraryAirline[] {
  const airlines = new Map<string, TicketingItineraryAirline>()
  for (const airline of [
    response.booking.defaultAirline,
    ...response.sectors.map((sector) => sector.airline),
    ...ledgerAirlines,
  ]) {
    airlines.set(airline.id, airline)
  }
  return [...airlines.values()].sort((a, b) => a.iataCode.localeCompare(b.iataCode))
}

function mergeAirports(
  current: TicketingAirportOption[],
  incoming: TicketingAirportOption[],
): TicketingAirportOption[] {
  const airports = new Map(current.map((airport) => [airport.iataCode, airport]))
  for (const airport of incoming) airports.set(airport.iataCode, airport)
  return [...airports.values()].sort((left, right) => left.iataCode.localeCompare(right.iataCode))
}

export function TicketItineraryDrawer({
  item,
  airlines: ledgerAirlines,
  onClose,
  onSaved,
}: {
  item: TicketLedgerItem | null
  airlines: TicketAirlineOption[]
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [detail, setDetail] = useState<TicketingItineraryResponse | null>(null)
  const [airports, setAirports] = useState<TicketingAirportOption[]>([])
  const [draft, setDraft] = useState<ItineraryDraft | null>(null)
  const [initialDraft, setInitialDraft] = useState<ItineraryDraft | null>(null)
  const [errors, setErrors] = useState<ItineraryErrors>({})
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const requestId = useRef(newRequestId())
  const formRef = useRef<HTMLFormElement>(null)
  const airportListId = useId()
  const mergeLoadedAirports = useCallback((options: TicketingAirportOption[]) => {
    setAirports((current) => mergeAirports(current, options))
  }, [])

  useEffect(() => {
    if (!item) {
      setDetail(null)
      setDraft(null)
      setInitialDraft(null)
      setAirports([])
      setErrors({})
      setLoadError('')
      setSaveError('')
      return
    }

    const controller = new AbortController()
    setIsLoading(true)
    setDetail(null)
    setDraft(null)
    setInitialDraft(null)
    setErrors({})
    setLoadError('')
    setSaveError('')
    requestId.current = newRequestId()

    void loadTicketItinerary(item.bookingId, controller.signal)
      .then(async (response) => {
        const codes = [
          ...new Set(
            response.sectors.flatMap((sector) => [sector.originIata, sector.destinationIata]),
          ),
        ]
        const airportOptions = await loadTicketAirports({ codes }, controller.signal)
        return { response, airportOptions }
      })
      .then(({ response, airportOptions }) => {
        const nextDraft = draftFromResponse(response)
        setDetail(response)
        setAirports(airportOptions)
        setDraft(nextDraft)
        setInitialDraft(nextDraft)
      })
      .catch((caught) => {
        if (controller.signal.aborted) return
        setLoadError(
          caught instanceof TicketItineraryApiError
            ? caught.message
            : 'Unable to load this itinerary. Try again.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [item, retryCount])

  const dirty = Boolean(
    draft && initialDraft && JSON.stringify(draft) !== JSON.stringify(initialDraft),
  )
  const itineraryDirty = Boolean(
    draft && initialDraft && JSON.stringify(draft.sectors) !== JSON.stringify(initialDraft.sectors),
  )
  const airlineOptions = useMemo(
    () => (detail ? mergeAirlines(ledgerAirlines, detail) : []),
    [detail, ledgerAirlines],
  )
  const airportByIata = useMemo(
    () => new Map(airports.map((airport) => [airport.iataCode, airport])),
    [airports],
  )
  const isOnBehalf = detail?.context.isOnBehalf === true
  const reasonRequired = isOnBehalf && detail?.context.onBehalfReasonRequired === true

  const updateDraft = (update: (current: ItineraryDraft) => ItineraryDraft) => {
    if (isSaving) return
    requestId.current = newRequestId()
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

  const validate = (): ItineraryErrors => {
    if (!draft || !detail) return { form: 'Itinerary details are not ready.' }
    const nextErrors: ItineraryErrors = {}
    if (draft.sectors.length < 1 || draft.sectors.length > TICKET_ITINERARY_MAX_SECTORS) {
      nextErrors.form = `Add between 1 and ${TICKET_ITINERARY_MAX_SECTORS} flight sectors.`
    }
    if (reasonRequired && !draft.adminReason.trim()) {
      nextErrors.adminReason = 'Enter a reason for updating this itinerary on behalf of staff.'
    } else if (draft.adminReason.trim().length > 500) {
      nextErrors.adminReason = 'Keep the on-behalf reason to 500 characters or fewer.'
    }

    const validAirlineIds = new Set(airlineOptions.map((airline) => airline.id))
    draft.sectors.forEach((sector, index) => {
      const prefix = `sectors.${index}`
      const flightNumber = sector.flightNumber.trim().toUpperCase()
      const origin = sector.originIata.trim().toUpperCase()
      const destination = sector.destinationIata.trim().toUpperCase()
      if (sector.airlineId && !validAirlineIds.has(sector.airlineId)) {
        nextErrors[`${prefix}.airlineId`] = 'Choose a listed airline or use the booking airline.'
      }
      if (!flightNumber || flightNumber.length > 20 || !FLIGHT_NUMBER_PATTERN.test(flightNumber)) {
        nextErrors[`${prefix}.flightNumber`] = 'Enter a valid flight number.'
      }
      if (!/^[A-Z]{3}$/.test(origin)) {
        nextErrors[`${prefix}.originIata`] = 'Enter a three-letter origin airport code.'
      } else if (!airportByIata.has(origin)) {
        nextErrors[`${prefix}.originIata`] = 'Choose an origin from the airport directory.'
      }
      if (!/^[A-Z]{3}$/.test(destination)) {
        nextErrors[`${prefix}.destinationIata`] = 'Enter a three-letter destination airport code.'
      } else if (!airportByIata.has(destination)) {
        nextErrors[`${prefix}.destinationIata`] = 'Choose a destination from the airport directory.'
      } else if (origin === destination) {
        nextErrors[`${prefix}.destinationIata`] = 'Destination must be different from origin.'
      }
      if (!validLocalDateTime(sector.departureLocal)) {
        nextErrors[`${prefix}.departureLocal`] = 'Enter the local departure date and time.'
      }
      if (sector.arrivalLocal && !validLocalDateTime(sector.arrivalLocal)) {
        nextErrors[`${prefix}.arrivalLocal`] = 'Enter a valid local arrival date and time.'
      }
    })
    return nextErrors
  }

  const focusFirstError = () => {
    window.requestAnimationFrame(() => {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    })
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!item || !detail || !draft || isSaving) return

    const nextErrors = validate()
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError()
      return
    }

    const input: TicketingReplaceItineraryInput = {
      requestId: requestId.current,
      expectedVersion: detail.itineraryVersion,
      adminReason: isOnBehalf ? draft.adminReason.trim() || null : null,
      sectors: draft.sectors.map((sector) => ({
        airlineId: sector.airlineId || null,
        flightNumber: sector.flightNumber.trim().toUpperCase(),
        originIata: sector.originIata.trim().toUpperCase(),
        destinationIata: sector.destinationIata.trim().toUpperCase(),
        departureLocal: sector.departureLocal,
        arrivalLocal: sector.arrivalLocal || null,
      })),
    }

    setIsSaving(true)
    setSaveError('')
    try {
      const saved = await replaceTicketItinerary(item.bookingId, input)
      setDetail(saved)
      const savedDraft = draftFromResponse(saved)
      setDraft(savedDraft)
      setInitialDraft(savedDraft)
      toast.success(
        isOnBehalf
          ? `Itinerary saved on behalf of ${detail.booking.ownerEmployee.fullName}`
          : 'Ticket itinerary saved',
      )
      onClose()
      void Promise.resolve()
        .then(onSaved)
        .catch(() => {
          toast.error('Itinerary saved, but the ledger could not be refreshed.')
        })
    } catch (caught) {
      if (caught instanceof TicketItineraryApiError) {
        setErrors(caught.fieldErrors)
        setSaveError(
          caught.code === 'VERSION_CONFLICT'
            ? 'This itinerary changed after you opened it. Your entries remain here; close and reopen it to review the latest version.'
            : caught.message,
        )
      } else {
        setSaveError('Unable to save this itinerary. Your entries remain here for retry.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const footer =
    detail && draft ? (
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-slate-500">
          Times are entered in each airport&apos;s local time.
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
            form="ticket-itinerary-form"
            disabled={isSaving || !itineraryDirty}
            className="ui-tap ui-focus inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#8b1e2d] px-5 text-sm font-black text-white hover:bg-[#6f1422] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {isSaving ? 'Saving…' : isOnBehalf ? 'Save on behalf' : 'Save itinerary'}
          </button>
        </div>
      </div>
    ) : undefined

  return (
    <>
      <DrawerBase
        isOpen={Boolean(item)}
        onClose={requestClose}
        title={detail ? `${detail.booking.pnr} itinerary` : 'Ticket itinerary'}
        description={
          detail
            ? `${detail.booking.customerName} · ${detail.booking.defaultAirline.iataCode} booking`
            : 'Add the active flight sectors for Flight Monitoring.'
        }
        footer={footer}
        isLoading={isSaving}
        closeDisabled={isSaving}
        isActive={!confirmDiscard}
        className="sm:max-w-3xl"
      >
        {isLoading ? (
          <div
            className="flex min-h-80 flex-col items-center justify-center gap-3 p-6"
            role="status"
          >
            <Loader2 className="h-7 w-7 animate-spin text-[#8b1e2d]" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-600">Loading itinerary…</p>
          </div>
        ) : loadError ? (
          <div
            className="flex min-h-80 flex-col items-center justify-center p-6 text-center"
            role="alert"
          >
            <CircleAlert className="h-9 w-9 text-red-600" aria-hidden="true" />
            <h3 className="mt-3 text-lg font-black text-slate-950">Itinerary unavailable</h3>
            <p className="mt-2 max-w-md text-sm text-red-700">{loadError}</p>
            <button
              type="button"
              onClick={() => setRetryCount((current) => current + 1)}
              className="ui-tap ui-focus mt-5 min-h-11 rounded-xl bg-[#8b1e2d] px-5 text-sm font-bold text-white"
            >
              Try again
            </button>
          </div>
        ) : detail && draft ? (
          <form
            ref={formRef}
            id="ticket-itinerary-form"
            onSubmit={submit}
            noValidate
            className="space-y-5 p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <div>
                <p className="inline-flex items-center gap-2 font-mono text-lg font-black tracking-wide text-sky-950">
                  <PlaneTakeoff className="h-5 w-5" aria-hidden="true" />
                  {detail.booking.pnr}
                </p>
                <p className="mt-1 text-sm font-semibold text-sky-800">
                  {detail.booking.ownerEmployee.fullName} · {draft.sectors.length} of{' '}
                  {TICKET_ITINERARY_MAX_SECTORS} sectors
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-sky-800 ring-1 ring-sky-200">
                Version {detail.itineraryVersion}
              </span>
            </div>

            {isOnBehalf && (
              <section
                aria-label="On-behalf itinerary update"
                className="rounded-2xl border border-violet-200 bg-violet-50 p-4"
              >
                <p className="text-xs font-black uppercase tracking-[0.14em] text-violet-900">
                  Updating on behalf of staff
                </p>
                <p className="mt-1 text-sm font-bold text-violet-950">
                  Responsible agent: {detail.booking.ownerEmployee.fullName}
                </p>
                <p className="mt-1 text-xs font-semibold text-violet-800">
                  The responsible agent remains unchanged and your signed-in account is recorded as
                  the person making this update.
                </p>
                <label className="mt-3 block text-xs font-bold text-slate-700">
                  On-behalf reason
                  <textarea
                    value={draft.adminReason}
                    onChange={(event) =>
                      updateDraft((current) => ({ ...current, adminReason: event.target.value }))
                    }
                    maxLength={500}
                    rows={2}
                    required={reasonRequired}
                    disabled={isSaving}
                    aria-label="On-behalf itinerary reason"
                    aria-invalid={Boolean(errors.adminReason)}
                    aria-describedby={
                      errors.adminReason ? 'itinerary-admin-reason-error' : undefined
                    }
                    className={fieldClass(Boolean(errors.adminReason))}
                    placeholder="For example: updating the booking while the agent is off sick"
                  />
                  <FieldError id="itinerary-admin-reason-error" message={errors.adminReason} />
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
            {errors.form && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800"
              >
                {errors.form}
              </div>
            )}

            <datalist id={airportListId}>
              {airports.map((airport) => (
                <option key={airport.iataCode} value={airport.iataCode}>
                  {airport.city} · {airport.name} · {airport.timezone}
                </option>
              ))}
            </datalist>

            <div className="space-y-4">
              {draft.sectors.map((sector, index) => {
                const prefix = `sectors.${index}`
                const idPrefix = `itinerary-sector-${index + 1}`
                const originAirport = airportByIata.get(sector.originIata)
                const destinationAirport = airportByIata.get(sector.destinationIata)
                return (
                  <fieldset
                    key={sector.key}
                    disabled={isSaving}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <legend className="sr-only">Flight sector {index + 1}</legend>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
                          {index + 1}
                        </span>
                        <div>
                          <p className="text-sm font-black text-slate-950">Flight sector</p>
                          <p className="text-[11px] font-semibold text-slate-500">
                            {sector.originIata || 'Origin'} →{' '}
                            {sector.destinationIata || 'Destination'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft((current) => {
                              if (index === 0) return current
                              const sectors = [...current.sectors]
                              ;[sectors[index - 1], sectors[index]] = [
                                sectors[index],
                                sectors[index - 1],
                              ]
                              return { ...current, sectors }
                            })
                          }
                          disabled={index === 0 || isSaving}
                          aria-label={`Move flight sector ${index + 1} up`}
                          className="ui-tap ui-focus flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                        >
                          <ArrowUp className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft((current) => {
                              if (index === current.sectors.length - 1) return current
                              const sectors = [...current.sectors]
                              ;[sectors[index], sectors[index + 1]] = [
                                sectors[index + 1],
                                sectors[index],
                              ]
                              return { ...current, sectors }
                            })
                          }
                          disabled={index === draft.sectors.length - 1 || isSaving}
                          aria-label={`Move flight sector ${index + 1} down`}
                          className="ui-tap ui-focus flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                        >
                          <ArrowDown className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateDraft((current) => ({
                              ...current,
                              sectors: current.sectors.filter(
                                (_, candidateIndex) => candidateIndex !== index,
                              ),
                            }))
                          }
                          disabled={draft.sectors.length === 1 || isSaving}
                          aria-label={`Remove flight sector ${index + 1}`}
                          className="ui-tap ui-focus flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:opacity-40"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-bold text-slate-700">
                        Airline <span className="font-normal text-slate-400">(optional)</span>
                        <select
                          value={sector.airlineId}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              sectors: current.sectors.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, airlineId: event.target.value }
                                  : candidate,
                              ),
                            }))
                          }
                          aria-label={`Flight sector ${index + 1} airline`}
                          aria-invalid={Boolean(errors[`${prefix}.airlineId`])}
                          aria-describedby={
                            errors[`${prefix}.airlineId`] ? `${idPrefix}-airline-error` : undefined
                          }
                          className={fieldClass(Boolean(errors[`${prefix}.airlineId`]))}
                        >
                          <option value="">
                            Booking airline — {detail.booking.defaultAirline.iataCode}
                          </option>
                          {airlineOptions.map((airline) => (
                            <option key={airline.id} value={airline.id}>
                              {airline.iataCode} · {airline.name}
                            </option>
                          ))}
                        </select>
                        <FieldError
                          id={`${idPrefix}-airline-error`}
                          message={errors[`${prefix}.airlineId`]}
                        />
                      </label>

                      <label className="text-xs font-bold text-slate-700">
                        Flight number
                        <input
                          value={sector.flightNumber}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              sectors: current.sectors.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? {
                                      ...candidate,
                                      flightNumber: event.target.value.toUpperCase(),
                                    }
                                  : candidate,
                              ),
                            }))
                          }
                          maxLength={20}
                          autoComplete="off"
                          spellCheck={false}
                          required
                          aria-label={`Flight sector ${index + 1} flight number`}
                          aria-invalid={Boolean(errors[`${prefix}.flightNumber`])}
                          aria-describedby={
                            errors[`${prefix}.flightNumber`]
                              ? `${idPrefix}-flight-number-error`
                              : undefined
                          }
                          className={`${fieldClass(Boolean(errors[`${prefix}.flightNumber`]))} font-mono uppercase`}
                          placeholder="1980"
                        />
                        <FieldError
                          id={`${idPrefix}-flight-number-error`}
                          message={errors[`${prefix}.flightNumber`]}
                        />
                      </label>

                      <AirportCodeField
                        label="Origin airport"
                        value={sector.originIata}
                        airport={originAirport}
                        listId={airportListId}
                        ariaLabel={`Flight sector ${index + 1} origin airport`}
                        errorId={`${idPrefix}-origin-error`}
                        errorMessage={errors[`${prefix}.originIata`]}
                        onAirportsLoaded={mergeLoadedAirports}
                        onChange={(originIata) =>
                          updateDraft((current) => ({
                            ...current,
                            sectors: current.sectors.map((candidate, candidateIndex) =>
                              candidateIndex === index ? { ...candidate, originIata } : candidate,
                            ),
                          }))
                        }
                      />

                      <AirportCodeField
                        label="Destination airport"
                        value={sector.destinationIata}
                        airport={destinationAirport}
                        listId={airportListId}
                        ariaLabel={`Flight sector ${index + 1} destination airport`}
                        errorId={`${idPrefix}-destination-error`}
                        errorMessage={errors[`${prefix}.destinationIata`]}
                        onAirportsLoaded={mergeLoadedAirports}
                        onChange={(destinationIata) =>
                          updateDraft((current) => ({
                            ...current,
                            sectors: current.sectors.map((candidate, candidateIndex) =>
                              candidateIndex === index
                                ? { ...candidate, destinationIata }
                                : candidate,
                            ),
                          }))
                        }
                      />

                      <label className="text-xs font-bold text-slate-700">
                        Departure local time
                        <input
                          type="datetime-local"
                          value={sector.departureLocal}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              sectors: current.sectors.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, departureLocal: event.target.value }
                                  : candidate,
                              ),
                            }))
                          }
                          min="2000-01-01T00:00"
                          max="2200-12-31T23:59"
                          step={1}
                          required
                          aria-label={`Flight sector ${index + 1} departure local time`}
                          aria-invalid={Boolean(errors[`${prefix}.departureLocal`])}
                          aria-describedby={
                            errors[`${prefix}.departureLocal`]
                              ? `${idPrefix}-departure-error`
                              : undefined
                          }
                          className={fieldClass(Boolean(errors[`${prefix}.departureLocal`]))}
                        />
                        <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                          {originAirport?.timezone || 'Origin airport time'}
                        </span>
                        <FieldError
                          id={`${idPrefix}-departure-error`}
                          message={errors[`${prefix}.departureLocal`]}
                        />
                      </label>

                      <label className="text-xs font-bold text-slate-700">
                        Arrival local time{' '}
                        <span className="font-normal text-slate-400">(optional)</span>
                        <input
                          type="datetime-local"
                          value={sector.arrivalLocal}
                          onChange={(event) =>
                            updateDraft((current) => ({
                              ...current,
                              sectors: current.sectors.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? { ...candidate, arrivalLocal: event.target.value }
                                  : candidate,
                              ),
                            }))
                          }
                          min="2000-01-01T00:00"
                          max="2200-12-31T23:59"
                          step={1}
                          aria-label={`Flight sector ${index + 1} arrival local time`}
                          aria-invalid={Boolean(errors[`${prefix}.arrivalLocal`])}
                          aria-describedby={
                            errors[`${prefix}.arrivalLocal`]
                              ? `${idPrefix}-arrival-error`
                              : undefined
                          }
                          className={fieldClass(Boolean(errors[`${prefix}.arrivalLocal`]))}
                        />
                        <span className="mt-1 block text-[11px] font-semibold text-slate-500">
                          {destinationAirport?.timezone || 'Destination airport time'}
                        </span>
                        <FieldError
                          id={`${idPrefix}-arrival-error`}
                          message={errors[`${prefix}.arrivalLocal`]}
                        />
                      </label>
                    </div>
                  </fieldset>
                )
              })}
            </div>

            <button
              type="button"
              onClick={() =>
                updateDraft((current) => ({
                  ...current,
                  sectors: [
                    ...current.sectors,
                    blankSector(current.sectors[current.sectors.length - 1]),
                  ],
                }))
              }
              disabled={isSaving || draft.sectors.length >= TICKET_ITINERARY_MAX_SECTORS}
              className="ui-tap ui-focus inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-sky-300 bg-sky-50 px-4 text-sm font-black text-sky-800 hover:bg-sky-100 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {draft.sectors.length >= TICKET_ITINERARY_MAX_SECTORS
                ? 'Maximum 12 sectors reached'
                : 'Add another flight sector'}
            </button>

            <p className="flex items-start gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              Type at least two letters of an IATA code. Matching airports are pulled from the
              stored directory, and their locations determine local time automatically.
            </p>
          </form>
        ) : null}
      </DrawerBase>

      <ConfirmationDialog
        isOpen={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(onClose)
          else onClose()
        }}
        title="Discard unsaved itinerary?"
        message="Your flight-sector changes have not been saved."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        type="warning"
      />
    </>
  )
}
