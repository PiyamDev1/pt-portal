'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import { Building2, Bus, CheckCircle2, FileText, Loader2, Plane, Send, Tag } from 'lucide-react'
import type {
  PackagePaymentMethod,
  PackageQuotePayload,
  PackageResolvedSelection,
  TravelPackageQuote,
} from '@/app/types/packages'
import {
  buildCustomerPackageOptions,
  formatMoney,
  getDefaultPackageSelection,
  getFlightOptionPriceDeltas,
  getPackagePassengerPriceBreakdown,
  isLimitedTimeOfferActive,
  normalizePackageQuotePayload,
  resolvePackageSelection,
} from '@/lib/packageQuote'

type PackageShareClientProps = {
  token: string
}

type QuoteResponse = {
  quote?: TravelPackageQuote
  error?: string
}

type SelectionResponse = {
  selected?: PackageResolvedSelection
  error?: string
}

type CustomerFields = {
  customerName: string
  customerPhone: string
  customerEmail: string
  note: string
}

function firstSelections(payload: PackageQuotePayload) {
  return getDefaultPackageSelection(payload)
}

function formatExpiry(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'expiry unavailable'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatOfferDeadline(value: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function OptionButton({
  selected,
  title,
  summary,
  priceLabel,
  onClick,
}: {
  selected: boolean
  title: string
  summary: string
  priceLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-4 text-left transition ${
        selected
          ? 'border-[#8b1e2d] bg-red-50 shadow-sm'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-950">{title || 'Option'}</p>
          {summary && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{summary}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="max-w-[12rem] whitespace-normal text-sm font-black leading-5 text-slate-950">
            {priceLabel}
          </p>
          {selected && <CheckCircle2 className="ml-auto mt-2 h-5 w-5 text-[#8b1e2d]" />}
        </div>
      </div>
    </button>
  )
}

function formatDelta(value: number, currency: string) {
  if (Math.abs(value) < 0.005) return 'Included'
  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)}`
}

const PAYMENT_METHODS: Array<{ value: PackagePaymentMethod; label: string }> = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
]

function getVisaQuantity(option: { quantity?: number }, payload: PackageQuotePayload) {
  return option.quantity && option.quantity > 0
    ? option.quantity
    : payload.adults + payload.childrenPaying + payload.childrenFree
}

export default function PackageShareClient({ token }: PackageShareClientProps) {
  const [quote, setQuote] = useState<TravelPackageQuote | null>(null)
  const [payload, setPayload] = useState<PackageQuotePayload | null>(null)
  const [selection, setSelection] = useState<ReturnType<typeof firstSelections> | null>(null)
  const [customer, setCustomer] = useState<CustomerFields>({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    note: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedSelection, setSavedSelection] = useState<PackageResolvedSelection | null>(null)

  useEffect(() => {
    const loadQuote = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/packages/share/${encodeURIComponent(token)}`)
        const data = (await response.json()) as QuoteResponse
        if (!response.ok || !data.quote) throw new Error(data.error || 'Package quote not found')

        const normalized = normalizePackageQuotePayload(data.quote.payload)
        setQuote(data.quote)
        setPayload(normalized)
        setSelection(firstSelections(normalized))
        setCustomer({
          customerName: data.quote.customer_name || normalized.customerName,
          customerPhone: data.quote.customer_phone || normalized.customerPhone,
          customerEmail: data.quote.customer_email || normalized.customerEmail,
          note: '',
        })
        setSavedSelection(data.quote.selected_option)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load package quote')
      } finally {
        setLoading(false)
      }
    }

    void loadQuote()
  }, [token])

  const resolved = useMemo(() => {
    if (!payload || !selection) return null
    try {
      return resolvePackageSelection(payload, selection)
    } catch {
      return null
    }
  }, [payload, selection])

  const customerOptions = useMemo(() => {
    if (!payload) return []
    return buildCustomerPackageOptions(payload, 80)
  }, [payload])

  const baseTotal = customerOptions[0]?.combination.totalPrice || 0
  const priceBreakdown = useMemo(() => {
    if (!payload || !resolved) return null
    return getPackagePassengerPriceBreakdown(payload, resolved.combination)
  }, [payload, resolved])

  const visibleOffers = useMemo(() => {
    if (!payload) return []
    return payload.limitedTimeOffers.filter((offer) => offer.active)
  }, [payload])

  const updateCustomer = (changes: Partial<CustomerFields>) => {
    setCustomer((current) => ({ ...current, ...changes }))
  }

  const submitSelection = async () => {
    if (!payload || !selection) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/packages/share/${encodeURIComponent(token)}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selection, ...customer }),
      })
      const data = (await response.json()) as SelectionResponse
      if (!response.ok || !data.selected) throw new Error(data.error || 'Unable to save selection')
      setSavedSelection(data.selected)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save selection')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-bold">Loading package quote</span>
        </div>
      </main>
    )
  }

  if (error && !payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-lg rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-black text-slate-950">Package quote unavailable</p>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </main>
    )
  }

  if (!quote || !payload || !selection) return null

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="bg-[#4b0f16] px-4 py-6 text-white">
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-red-100">Piyam Travel package quote</p>
            <h1 className="mt-2 text-3xl font-black">{payload.title}</h1>
          </div>
          <div className="shrink-0 rounded-xl bg-white p-2 shadow-sm">
            <Image
              src="/logo.png"
              alt="Piyam Travel"
              width={92}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </div>
        </div>
        <div className="mx-auto max-w-6xl">
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">{payload.packageType}</span>
            <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">
              Valid until {formatExpiry(quote.expires_at)}
            </span>
            {payload.departureDate && (
              <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">
                Depart {new Date(payload.departureDate).toLocaleDateString('en-GB')}
              </span>
            )}
            {payload.returnDate && (
              <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">
                Return {new Date(payload.returnDate).toLocaleDateString('en-GB')}
              </span>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {payload.flightOptions.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Plane className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">Flights</h2>
              </div>
              <div className="space-y-3">
                {payload.flightOptions.map((option) => {
                  const defaultFlight = payload.flightOptions.find((item) => item.isDefault) || payload.flightOptions[0]
                  const deltas = getFlightOptionPriceDeltas(payload, option, defaultFlight)
                  const priceLabel =
                    option.id === defaultFlight?.id
                      ? 'Included'
                      : [
                          `Adult ${formatDelta(deltas.adult, payload.currency)}`,
                          `Child ${formatDelta(deltas.child, payload.currency)}`,
                          `Under 5 ${formatDelta(deltas.infant, payload.currency)}`,
                        ].join(' / ')
                  return (
                    <OptionButton
                      key={option.id}
                      selected={selection.flightOptionId === option.id}
                      title={option.title}
                      summary={option.summary}
                      priceLabel={priceLabel}
                      onClick={() =>
                        setSelection((current) =>
                          current ? { ...current, flightOptionId: option.id } : current,
                        )
                      }
                    />
                  )
                })}
              </div>
            </section>
          )}

          {payload.visaOptions.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <FileText className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">Visa</h2>
              </div>
              <div className="space-y-3">
                {payload.visaOptions.map((option) => (
                  <div
                    key={option.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">
                          {option.title || 'Visa'}
                        </p>
                        {option.summary && (
                          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                            {option.summary}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-black text-slate-950">
                        {getVisaQuantity(option, payload)} included
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {payload.transportOptions.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Bus className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">Transport</h2>
              </div>
              <div className="space-y-3">
                {payload.transportOptions.map((option, index) => (
                  <OptionButton
                    key={option.id}
                    selected={selection.transportOptionId === option.id}
                    title={option.title}
                    summary={option.summary}
                    priceLabel={
                      index === 0
                        ? 'Included'
                        : formatDelta(
                            option.price - (payload.transportOptions[0]?.price || 0),
                            payload.currency,
                          )
                    }
                    onClick={() =>
                      setSelection((current) =>
                        current ? { ...current, transportOptionId: option.id } : current,
                      )
                    }
                  />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                <Building2 className="h-4 w-4" />
              </span>
              <h2 className="text-lg font-black">Package Options</h2>
            </div>
            <div className="space-y-3">
              {customerOptions.map(({ selection: optionSelection, combination }, index) => {
                const selected = Object.entries(optionSelection.stayOptionIds).every(
                  ([groupId, optionId]) => selection.stayOptionIds[groupId] === optionId,
                )
                const delta = combination.totalPrice - baseTotal
                const summary = combination.staySelections
                  .map((stay) => `${stay.groupLabel}: ${stay.option.summary || stay.option.title}`)
                  .join('\n\n')
                return (
                  <OptionButton
                    key={combination.id}
                    selected={selected}
                    title={`Option ${index + 1}`}
                    summary={summary}
                    priceLabel={index === 0 ? 'Included' : formatDelta(delta, combination.currency)}
                    onClick={() =>
                      setSelection((current) =>
                        current
                          ? {
                              ...current,
                              stayOptionIds: optionSelection.stayOptionIds,
                            }
                          : current,
                      )
                    }
                  />
                )
              })}
            </div>
          </section>

          {visibleOffers.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
                  <Tag className="h-4 w-4" />
                </span>
                <h2 className="text-lg font-black">Limited Time Offers</h2>
              </div>
              <div className="space-y-3">
                {visibleOffers.map((offer) => {
                  const active = isLimitedTimeOfferActive(offer)
                  return (
                    <div
                      key={offer.id}
                      className={`rounded-xl border p-4 ${
                        active ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-950">{offer.title}</p>
                          {offer.summary && (
                            <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                              {offer.summary}
                            </p>
                          )}
                          {offer.expiresAt && (
                            <p className="mt-2 text-xs font-bold text-slate-500">
                              Valid until {formatOfferDeadline(offer.expiresAt)}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 rounded-lg bg-white px-3 py-2 text-right shadow-sm">
                          <p className="text-sm font-black text-emerald-700">
                            {formatMoney(offer.discountAmount, payload.currency)} off
                          </p>
                          <p className="text-[11px] font-bold text-slate-500">
                            {offer.discountMode === 'per_person' ? 'per person' : 'total'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-black text-slate-950">Total</p>
            {resolved ? (
              <>
                {resolved.combination.offerDiscountTotal > 0 && (
                  <div className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                    Discount applied: -
                    {formatMoney(
                      resolved.combination.offerDiscountTotal,
                      resolved.combination.currency,
                    )}
                  </div>
                )}
                <p className="mt-2 text-3xl font-black text-slate-950">
                  {formatMoney(resolved.combination.totalPrice, resolved.combination.currency)}
                </p>
                {resolved.combination.paymentSurchargeTotal > 0 && (
                  <p className="mt-1 text-sm font-bold text-slate-600">
                    Includes card charge:{' '}
                    {formatMoney(
                      resolved.combination.paymentSurchargeTotal,
                      resolved.combination.currency,
                    )}
                  </p>
                )}
                {priceBreakdown && (
                  <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-slate-600">Adult 12+</span>
                      <span className="font-black text-slate-950">
                        {formatMoney(priceBreakdown.adult, priceBreakdown.currency)} each
                      </span>
                    </div>
                    {payload.childrenPaying > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-slate-600">Child 5+</span>
                        <span className="font-black text-slate-950">
                          {formatMoney(priceBreakdown.child, priceBreakdown.currency)} each
                        </span>
                      </div>
                    )}
                    {payload.childrenFree > 0 && (
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-slate-600">Child under 5</span>
                        <span className="font-black text-slate-950">
                          {formatMoney(priceBreakdown.infant, priceBreakdown.currency)} each
                        </span>
                      </div>
                    )}
                  </div>
                )}
                {resolved.combination.servicePassengers !== resolved.combination.payingGuests && (
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Services calculated for {resolved.combination.servicePassengers} passengers.
                  </p>
                )}
                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase text-slate-500">
                    How would you like to pay?
                  </p>
                  <div className="grid gap-2">
                    {PAYMENT_METHODS.map((method) => {
                      const active = (selection.paymentMethod || 'bank_transfer') === method.value
                      return (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() =>
                            setSelection((current) =>
                              current ? { ...current, paymentMethod: method.value } : current,
                            )
                          }
                          className={`min-h-10 rounded-lg px-3 text-sm font-black transition ${
                            active
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {method.label}
                          {method.value === 'card' && payload.cardProcessingFeePercent > 0
                            ? ` +${payload.cardProcessingFeePercent}%`
                            : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-red-600">Selection is incomplete.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-black text-slate-950">Your contact details</p>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Name</span>
                <input
                  value={customer.customerName}
                  onChange={(event) => updateCustomer({ customerName: event.target.value })}
                  placeholder="Your full name"
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Phone</span>
                <input
                  value={customer.customerPhone}
                  onChange={(event) => updateCustomer({ customerPhone: event.target.value })}
                  placeholder="Your WhatsApp or phone number"
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Email</span>
                <input
                  value={customer.customerEmail}
                  onChange={(event) => updateCustomer({ customerEmail: event.target.value })}
                  placeholder="Your email address"
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Notes</span>
                <textarea
                  value={customer.note}
                  onChange={(event) => updateCustomer({ note: event.target.value })}
                  placeholder="Anything you want us to know"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <p className="rounded-lg bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                Finalising sends your preferred option to Piyam Travel. This is not a confirmed
                booking until availability is checked and reservations are completed by an agent.
                Passport copies should be sent via WhatsApp.
              </p>
              <button
                type="button"
                onClick={() => void submitSelection()}
                disabled={!resolved || saving}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-black text-white transition hover:bg-[#6f1422] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Finalise Selection
              </button>
            </div>
            {savedSelection && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                Selection sent to Piyam Travel:{' '}
                {formatMoney(savedSelection.combination.totalPrice, savedSelection.combination.currency)}
              </div>
            )}
            {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}
          </section>
        </aside>
      </div>
    </main>
  )
}
