'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Building2,
  Bus,
  CheckCircle2,
  FileText,
  Loader2,
  Plane,
  Send,
  Tag,
} from 'lucide-react'
import type {
  PackagePaymentBreakdown,
  PackagePaymentMethod,
  PackageQuotePayload,
  PackageResolvedSelection,
  TravelPackageQuote,
} from '@/app/types/packages'
import {
  formatMoney,
  getDefaultPackageSelection,
  getFlightOptionPassengerPrices,
  getFlightOptionTotalDelta,
  getPackagePassengerPriceBreakdown,
  getPackagePaymentBreakdownTotal,
  isLimitedTimeOfferActive,
  normalizePackagePaymentBreakdown,
  normalizePackageQuotePayload,
  resolvePackageSelection,
} from '@/lib/packageQuote'

type PackageSalesModeClientProps = {
  quoteId: string
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

function SummaryText({ value }: { value: string }) {
  const lines = value.split('\n').filter((line) => line.trim().length > 0)
  if (lines.length === 0) return null

  return (
    <div className="mt-1 space-y-1 text-sm leading-6 text-slate-600">
      {lines.map((line, index) => {
        const bulletText = line.match(/^\*\s+(.+)$/)?.[1]
        if (bulletText) {
          return (
            <div key={`${line}-${index}`} className="flex gap-2">
              <span className="mt-[0.65rem] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
              <span>{bulletText}</span>
            </div>
          )
        }
        return <p key={`${line}-${index}`}>{line}</p>
      })}
    </div>
  )
}

function OptionButton({
  selected,
  title,
  summary,
  price,
  pricingMode,
  priceLabel,
  priceSubLabel,
  badges,
  currency,
  onClick,
}: {
  selected: boolean
  title: string
  summary: string
  price: number
  pricingMode?: 'total' | 'per_person'
  priceLabel?: string
  priceSubLabel?: string
  badges?: string[]
  currency: string
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
          {summary && <SummaryText value={summary} />}
          {badges && badges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-black text-emerald-800"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-slate-950">
            {priceLabel || formatMoney(price, currency)}
          </p>
          <p className="text-[11px] font-bold text-slate-500">
            {priceSubLabel || (pricingMode === 'per_person' ? 'per person' : 'total')}
          </p>
          {selected && <CheckCircle2 className="ml-auto mt-2 h-5 w-5 text-[#8b1e2d]" />}
        </div>
      </div>
    </button>
  )
}

const PAYMENT_BREAKDOWN_FIELDS: Array<{
  key: keyof PackagePaymentBreakdown
  label: string
}> = [
  { key: 'cash', label: 'Cash' },
  { key: 'bankTransfer', label: 'Bank Transfer' },
  { key: 'card', label: 'Credit Card' },
]

function getVisaQuantity(option: { quantity?: number }, payload: PackageQuotePayload) {
  return option.quantity && option.quantity > 0
    ? option.quantity
    : payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
}

function getPreferredOption<T extends { isDefault?: boolean }>(options: T[]) {
  return options.find((option) => option.isDefault) || options[0] || null
}

function formatDelta(value: number, currency: string) {
  if (Math.abs(value) < 0.005) return 'Included'
  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)} total`
}

function formatFlightPassengerPrices(
  payload: PackageQuotePayload,
  option: Parameters<typeof getFlightOptionPassengerPrices>[1],
) {
  const prices = getFlightOptionPassengerPrices(payload, option)
  const parts = [`Adult ${formatMoney(prices.adult, payload.currency)} pp`]
  if (payload.childrenPaying + payload.childrenFree > 0) {
    parts.push(`Child 2-12 ${formatMoney(prices.child, payload.currency)} pp`)
  }
  if (payload.infants > 0) {
    parts.push(`Infant 0-<2 ${formatMoney(prices.infant, payload.currency)} pp`)
  }
  return parts.join(' / ')
}

function pickMethodFromBreakdown(breakdown: PackagePaymentBreakdown): PackagePaymentMethod {
  if (breakdown.card > 0) return 'card'
  if (breakdown.cash > 0) return 'cash'
  return 'bank_transfer'
}

function buildSelectionNote(note: string, promoCode: string) {
  const parts = [note.trim()]
  if (promoCode.trim()) parts.push(`Promo code requested: ${promoCode.trim()}`)
  return parts.filter(Boolean).join('\n')
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Building2; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-lg font-black">{title}</h2>
    </div>
  )
}

export default function PackageSalesModeClient({ quoteId }: PackageSalesModeClientProps) {
  const [quote, setQuote] = useState<TravelPackageQuote | null>(null)
  const [payload, setPayload] = useState<PackageQuotePayload | null>(null)
  const [selection, setSelection] = useState<ReturnType<typeof firstSelections> | null>(null)
  const [customer, setCustomer] = useState<CustomerFields>({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    note: '',
  })
  const [promoCode, setPromoCode] = useState('')
  const [savedSelection, setSavedSelection] = useState<PackageResolvedSelection | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadQuote = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/packages/${encodeURIComponent(quoteId)}`)
        const data = (await response.json()) as QuoteResponse
        if (!response.ok || !data.quote) throw new Error(data.error || 'Package quote not found')

        const normalized = normalizePackageQuotePayload(data.quote.payload)
        const existingSelection = data.quote.selected_option?.selection
        setQuote(data.quote)
        setPayload(normalized)
        setSelection(
          existingSelection
            ? {
                stayOptionIds: existingSelection.stayOptionIds,
                flightOptionId: existingSelection.flightOptionId || null,
                visaOptionId: existingSelection.visaOptionId || null,
                transportOptionId: existingSelection.transportOptionId || null,
                paymentMethod: existingSelection.paymentMethod || 'bank_transfer',
                paymentBreakdown: existingSelection.paymentBreakdown || null,
              }
            : firstSelections(normalized),
        )
        setCustomer({
          customerName:
            existingSelection?.customerName || data.quote.customer_name || normalized.customerName,
          customerPhone:
            existingSelection?.customerPhone ||
            data.quote.customer_phone ||
            normalized.customerPhone,
          customerEmail:
            existingSelection?.customerEmail ||
            data.quote.customer_email ||
            normalized.customerEmail,
          note: existingSelection?.note || data.quote.selection_note || '',
        })
        setPromoCode('')
        setSavedSelection(data.quote.selected_option)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load quote')
      } finally {
        setLoading(false)
      }
    }

    void loadQuote()
  }, [quoteId])

  const resolved = useMemo(() => {
    if (!payload || !selection) return null
    try {
      return resolvePackageSelection(payload, selection)
    } catch {
      return null
    }
  }, [payload, selection])
  const paymentBreakdown = useMemo(() => {
    if (!payload || !selection || !resolved) return null
    return normalizePackagePaymentBreakdown(
      selection.paymentBreakdown,
      resolved.combination.packageSubtotalPrice,
      selection.paymentMethod || 'bank_transfer',
    )
  }, [payload, resolved, selection])
  const paymentBreakdownTotal = getPackagePaymentBreakdownTotal(paymentBreakdown)
  const paymentBreakdownRemaining = resolved
    ? resolved.combination.packageSubtotalPrice - paymentBreakdownTotal
    : 0
  const paymentBreakdownBalanced = !resolved || Math.abs(paymentBreakdownRemaining) < 0.01
  const priceBreakdown = useMemo(() => {
    if (!payload || !resolved) return null
    return getPackagePassengerPriceBreakdown(payload, resolved.combination)
  }, [payload, resolved])

  const orderedStayGroups = useMemo(() => {
    if (!payload) return []
    const order =
      payload.itineraryOrder.length > 0
        ? payload.itineraryOrder
        : payload.stayGroups.map((group) => group.id)
    return [...payload.stayGroups].sort((a, b) => {
      const aIndex = order.indexOf(a.id)
      const bIndex = order.indexOf(b.id)
      return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
    })
  }, [payload])

  const visibleOffers = useMemo(() => {
    if (!payload) return []
    return payload.limitedTimeOffers.filter((offer) => offer.active)
  }, [payload])

  const updateCustomer = (changes: Partial<CustomerFields>) => {
    setCustomer((current) => ({ ...current, ...changes }))
  }

  const finaliseSelection = async () => {
    if (!payload || !selection || !resolved || !paymentBreakdown) return
    if (!paymentBreakdownBalanced) {
      setError('Payment breakdown must match the package subtotal before finalising.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/packages/${encodeURIComponent(quoteId)}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selection,
          paymentMethod: pickMethodFromBreakdown(paymentBreakdown),
          paymentBreakdown,
          ...customer,
          note: buildSelectionNote(customer.note, promoCode),
        }),
      })
      const data = (await response.json()) as SelectionResponse
      if (!response.ok || !data.selected) {
        throw new Error(data.error || 'Unable to finalise selection')
      }
      setSavedSelection(data.selected)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to finalise selection')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[24rem] items-center justify-center">
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4 text-slate-700 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-bold">Loading sales mode</span>
        </div>
      </div>
    )
  }

  if (error && !payload) {
    return (
      <div className="rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-black text-slate-950">Sales mode unavailable</p>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
        <Link
          href="/dashboard/packages"
          className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-black text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Packages
        </Link>
      </div>
    )
  }

  if (!quote || !payload || !selection) return null

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Link
              href="/dashboard/packages"
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-600 hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Packages
            </Link>
            <p className="mt-3 text-xs font-bold uppercase text-slate-500">Sales / Clerk Mode</p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">{payload.title}</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Select and finalise the package privately while working with the customer in person or
              over the phone. The customer does not see this internal screen.
            </p>
          </div>
          <Link
            href={`/dashboard/packages/quotations/${quote.id}/edit`}
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700 transition hover:bg-slate-100"
          >
            Edit Quote
          </Link>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {payload.flightOptions.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionTitle icon={Plane} title="Flights" />
              <div className="space-y-3">
                {payload.flightOptions.map((option) => {
                  const defaultFlight = getPreferredOption(payload.flightOptions)
                  const delta = getFlightOptionTotalDelta(payload, option, defaultFlight)
                  return (
                    <OptionButton
                      key={option.id}
                      selected={selection.flightOptionId === option.id}
                      title={option.title}
                      summary={option.summary}
                      price={option.price}
                      priceLabel={formatDelta(delta, payload.currency)}
                      priceSubLabel={formatFlightPassengerPrices(payload, option)}
                      pricingMode={option.pricingMode}
                      currency={payload.currency}
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
              <SectionTitle icon={FileText} title="Visa" />
              <div className="space-y-3">
                {payload.visaOptions.map((option) => (
                  <div
                    key={option.id}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-950">
                          {option.title || 'Visa'}
                        </p>
                        {option.summary && <SummaryText value={option.summary} />}
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
              <SectionTitle icon={Bus} title="Transport" />
              <div className="space-y-3">
                {payload.transportOptions.map((option) => {
                  const defaultTransport = getPreferredOption(payload.transportOptions)
                  const delta = option.price - (defaultTransport?.price || 0)
                  const badges = [
                    option.includesZiyarat ? 'Ziyarat included' : '',
                    option.includesTourGuide ? 'Tour guide included' : '',
                  ].filter((badge): badge is string => Boolean(badge))
                  return (
                    <OptionButton
                      key={option.id}
                      selected={selection.transportOptionId === option.id}
                      title={option.title}
                      summary={option.summary}
                      price={option.price}
                      priceLabel={formatDelta(delta, payload.currency)}
                      pricingMode={option.pricingMode}
                      badges={badges}
                      currency={payload.currency}
                      onClick={() =>
                        setSelection((current) =>
                          current ? { ...current, transportOptionId: option.id } : current,
                        )
                      }
                    />
                  )
                })}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionTitle icon={Building2} title="Hotels" />
            <div className="space-y-4">
              {orderedStayGroups.map((group) => (
                <div key={group.id}>
                  <h3 className="mb-2 text-sm font-black text-slate-700">{group.label}</h3>
                  <div className="space-y-3">
                    {group.options.map((option) => {
                      const preferredHotel = getPreferredOption(group.options)
                      const delta = option.price - (preferredHotel?.price || 0)
                      return (
                        <OptionButton
                          key={option.id}
                          selected={selection.stayOptionIds[group.id] === option.id}
                          title={option.title}
                          summary={option.summary}
                          price={option.price}
                          priceLabel={formatDelta(delta, payload.currency)}
                          priceSubLabel="hotel option"
                          pricingMode={option.pricingMode}
                          currency={payload.currency}
                          onClick={() =>
                            setSelection((current) =>
                              current
                                ? {
                                    ...current,
                                    stayOptionIds: {
                                      ...current.stayOptionIds,
                                      [group.id]: option.id,
                                    },
                                  }
                                : current,
                            )
                          }
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {visibleOffers.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <SectionTitle icon={Tag} title="Limited Time Offers" />
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
                      <p className="text-sm font-black text-slate-950">{offer.title}</p>
                      {offer.summary && <SummaryText value={offer.summary} />}
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        {offer.discountAmount > 0
                          ? `${formatMoney(offer.discountAmount, payload.currency)} off ${
                              offer.discountMode === 'per_person' ? 'per person' : 'total'
                            }`
                          : 'No discount amount set'}
                        {offer.expiresAt
                          ? ` · valid until ${formatOfferDeadline(offer.expiresAt)}`
                          : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm font-black text-slate-950">Price summary</p>
            {resolved ? (
              <>
                {priceBreakdown && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-black uppercase text-slate-500">
                      Passenger pricing
                    </p>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-slate-600">
                          Adult 12+ x {payload.adults}
                        </span>
                        <span className="text-right font-black text-slate-950">
                          {formatMoney(priceBreakdown.adult, priceBreakdown.currency)} pp
                          <span className="block text-[11px] text-slate-500">
                            {formatMoney(priceBreakdown.adultTotal, priceBreakdown.currency)}
                          </span>
                        </span>
                      </div>
                      {payload.childrenPaying > 0 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-slate-600">
                            Child 5-12 x {payload.childrenPaying}
                          </span>
                          <span className="text-right font-black text-slate-950">
                            {formatMoney(priceBreakdown.child, priceBreakdown.currency)} pp
                            <span className="block text-[11px] text-slate-500">
                              {formatMoney(priceBreakdown.childTotal, priceBreakdown.currency)}
                            </span>
                          </span>
                        </div>
                      )}
                      {payload.childrenFree > 0 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-slate-600">
                            Child 2-4 hotel-free x {payload.childrenFree}
                          </span>
                          <span className="text-right font-black text-slate-950">
                            {formatMoney(priceBreakdown.childTwoToFour, priceBreakdown.currency)} pp
                            <span className="block text-[11px] text-slate-500">
                              {formatMoney(
                                priceBreakdown.childTwoToFourTotal,
                                priceBreakdown.currency,
                              )}
                            </span>
                          </span>
                        </div>
                      )}
                      {payload.infants > 0 && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold text-slate-600">
                            Infant 0-&lt;2 x {payload.infants}
                          </span>
                          <span className="text-right font-black text-slate-950">
                            {formatMoney(priceBreakdown.infant, priceBreakdown.currency)} pp
                            <span className="block text-[11px] text-slate-500">
                              {formatMoney(priceBreakdown.infantTotal, priceBreakdown.currency)}
                            </span>
                          </span>
                        </div>
                      )}
                      <div className="border-t border-slate-200 pt-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-black text-slate-950">Passenger line total</span>
                          <span className="font-black text-slate-950">
                            {formatMoney(priceBreakdown.total, priceBreakdown.currency)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-600">Package subtotal</span>
                    <span className="font-black text-slate-950">
                      {formatMoney(
                        resolved.combination.packageSubtotalPrice,
                        resolved.combination.currency,
                      )}
                    </span>
                  </div>
                  {resolved.combination.offerDiscountTotal > 0 && (
                    <div className="flex items-center justify-between gap-3 text-emerald-700">
                      <span className="font-bold">Discounts applied</span>
                      <span className="font-black">
                        -
                        {formatMoney(
                          resolved.combination.offerDiscountTotal,
                          resolved.combination.currency,
                        )}
                      </span>
                    </div>
                  )}
                  {resolved.combination.paymentSurchargeTotal > 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-slate-600">Credit Card processing fee</span>
                      <span className="font-black text-slate-950">
                        {formatMoney(
                          resolved.combination.paymentSurchargeTotal,
                          resolved.combination.currency,
                        )}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-bold text-slate-600">Additional charges</span>
                      <span className="font-black text-slate-950">None</span>
                    </div>
                  )}
                  <div className="border-t border-slate-200 pt-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-black text-slate-950">Total package price</span>
                      <span className="font-black text-slate-950">
                        {formatMoney(
                          resolved.combination.totalPrice,
                          resolved.combination.currency,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <label className="mt-4 block">
                  <span className="mb-1 block text-xs font-black uppercase text-slate-500">
                    Promo code
                  </span>
                  <input
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value)}
                    placeholder="Ask customer if they have a promo code"
                    className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                  />
                </label>
                {resolved.combination.paymentSurchargeTotal > 0 && (
                  <p className="mt-2 text-xs font-semibold text-slate-500">
                    Credit Card processing fees are non-refundable.
                  </p>
                )}
                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase text-slate-500">
                    Payment breakdown
                  </p>
                  <div className="grid gap-2">
                    {PAYMENT_BREAKDOWN_FIELDS.map((field) => {
                      const value = paymentBreakdown?.[field.key] || ''
                      return (
                        <label key={field.key} className="block">
                          <span className="mb-1 block text-xs font-bold text-slate-500">
                            {field.label}
                            {field.key === 'card' && payload.cardProcessingFeePercent > 0
                              ? ` +${payload.cardProcessingFeePercent}%`
                              : ''}
                          </span>
                          <div className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3">
                            <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={value}
                              onChange={(event) => {
                                const nextBreakdown = {
                                  ...(paymentBreakdown || { cash: 0, bankTransfer: 0, card: 0 }),
                                  [field.key]: Number(event.target.value || 0),
                                }
                                setSelection((current) =>
                                  current
                                    ? {
                                        ...current,
                                        paymentMethod: pickMethodFromBreakdown(nextBreakdown),
                                        paymentBreakdown: nextBreakdown,
                                      }
                                    : current,
                                )
                              }}
                              className="w-full bg-transparent text-sm font-bold outline-none"
                              placeholder="0.00"
                            />
                          </div>
                        </label>
                      )
                    })}
                  </div>
                  <div
                    className={`mt-3 rounded-lg p-2 text-xs font-bold ${
                      paymentBreakdownBalanced
                        ? 'bg-emerald-50 text-emerald-800'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {paymentBreakdownBalanced
                      ? 'Payment split matches the package subtotal.'
                      : `Remaining to allocate: ${formatMoney(paymentBreakdownRemaining, resolved.combination.currency)}`}
                  </div>
                  {payload.depositRequired && (payload.depositAmount || 0) > 0 && (
                    <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">
                      Deposit required to secure:{' '}
                      {formatMoney(payload.depositAmount || 0, payload.currency)}. This should be
                      paid first before availability or reservations are secured.
                    </p>
                  )}
                  {payload.cardProcessingFeePercent > 0 && (
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      Credit Card processing fees are non-refundable.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-red-600">Selection is incomplete.</p>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-black text-slate-950">Customer information</p>
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Customer name</span>
                <input
                  value={customer.customerName}
                  onChange={(event) => updateCustomer({ customerName: event.target.value })}
                  placeholder="Lead customer name"
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">
                  WhatsApp contact number
                </span>
                <input
                  value={customer.customerPhone}
                  onChange={(event) => updateCustomer({ customerPhone: event.target.value })}
                  placeholder="Customer WhatsApp number"
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Email address</span>
                <input
                  value={customer.customerEmail}
                  onChange={(event) => updateCustomer({ customerEmail: event.target.value })}
                  placeholder="Ask customer for their email address"
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">
                  Customer requirements and notes
                </span>
                <textarea
                  value={customer.note}
                  onChange={(event) => updateCustomer({ note: event.target.value })}
                  placeholder="Ask about wheelchair assistance, dietary requirements, room preferences, mobility needs, special assistance, or anything else we should know."
                  rows={4}
                  className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <button
                type="button"
                onClick={() => void finaliseSelection()}
                disabled={!resolved || !paymentBreakdownBalanced || saving}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-black text-white transition hover:bg-[#6f1422] disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Finalise In Sales Mode
              </button>
            </div>
            {savedSelection && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                Selection finalised:{' '}
                {formatMoney(
                  savedSelection.combination.totalPrice,
                  savedSelection.combination.currency,
                )}
              </div>
            )}
            {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}
          </section>
        </aside>
      </div>
    </div>
  )
}
