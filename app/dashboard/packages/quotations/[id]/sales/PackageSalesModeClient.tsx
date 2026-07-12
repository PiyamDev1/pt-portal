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
  PackagePaymentMethod,
  PackageQuotePayload,
  PackageResolvedSelection,
  TravelPackageQuote,
} from '@/app/types/packages'
import {
  formatMoney,
  getDefaultPackageSelection,
  isLimitedTimeOfferActive,
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

function OptionButton({
  selected,
  title,
  summary,
  price,
  pricingMode,
  currency,
  onClick,
}: {
  selected: boolean
  title: string
  summary: string
  price: number
  pricingMode?: 'total' | 'per_person'
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
          {summary && <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">{summary}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-black text-slate-950">{formatMoney(price, currency)}</p>
          <p className="text-[11px] font-bold text-slate-500">
            {pricingMode === 'per_person' ? 'per person' : 'total'}
          </p>
          {selected && <CheckCircle2 className="ml-auto mt-2 h-5 w-5 text-[#8b1e2d]" />}
        </div>
      </div>
    </button>
  )
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

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: typeof Building2
  title: string
}) {
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
              }
            : firstSelections(normalized),
        )
        setCustomer({
          customerName:
            existingSelection?.customerName || data.quote.customer_name || normalized.customerName,
          customerPhone:
            existingSelection?.customerPhone || data.quote.customer_phone || normalized.customerPhone,
          customerEmail:
            existingSelection?.customerEmail || data.quote.customer_email || normalized.customerEmail,
          note: existingSelection?.note || data.quote.selection_note || '',
        })
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

  const orderedStayGroups = useMemo(() => {
    if (!payload) return []
    const order = payload.itineraryOrder.length > 0 ? payload.itineraryOrder : payload.stayGroups.map((group) => group.id)
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
    if (!payload || !selection) return
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/packages/${encodeURIComponent(quoteId)}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selection, ...customer }),
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
              Select and finalise the package privately while working with the customer in person
              or over the phone. The customer does not see this internal screen.
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
                {payload.flightOptions.map((option) => (
                  <OptionButton
                    key={option.id}
                    selected={selection.flightOptionId === option.id}
                    title={option.title}
                    summary={option.summary}
                    price={option.price}
                    pricingMode={option.pricingMode}
                    currency={payload.currency}
                    onClick={() =>
                      setSelection((current) =>
                        current ? { ...current, flightOptionId: option.id } : current,
                      )
                    }
                  />
                ))}
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
              <SectionTitle icon={Bus} title="Transport" />
              <div className="space-y-3">
                {payload.transportOptions.map((option) => (
                  <OptionButton
                    key={option.id}
                    selected={selection.transportOptionId === option.id}
                    title={option.title}
                    summary={option.summary}
                    price={option.price}
                    pricingMode={option.pricingMode}
                    currency={payload.currency}
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
            <SectionTitle icon={Building2} title="Hotels" />
            <div className="space-y-4">
              {orderedStayGroups.map((group) => (
                <div key={group.id}>
                  <h3 className="mb-2 text-sm font-black text-slate-700">{group.label}</h3>
                  <div className="space-y-3">
                    {group.options.map((option) => (
                      <OptionButton
                        key={option.id}
                        selected={selection.stayOptionIds[group.id] === option.id}
                        title={option.title}
                        summary={option.summary}
                        price={option.price}
                        pricingMode={option.pricingMode}
                        currency={payload.currency}
                        onClick={() =>
                          setSelection((current) =>
                            current
                              ? {
                                  ...current,
                                  stayOptionIds: { ...current.stayOptionIds, [group.id]: option.id },
                                }
                              : current,
                          )
                        }
                      />
                    ))}
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
                      {offer.summary && (
                        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-600">
                          {offer.summary}
                        </p>
                      )}
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        {offer.discountAmount > 0
                          ? `${formatMoney(offer.discountAmount, payload.currency)} off ${
                              offer.discountMode === 'per_person' ? 'per person' : 'total'
                            }`
                          : 'No discount amount set'}
                        {offer.expiresAt ? ` · valid until ${formatOfferDeadline(offer.expiresAt)}` : ''}
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
            <p className="text-sm font-black text-slate-950">Final package total</p>
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
                <p className="text-sm font-bold text-[#8b1e2d]">
                  {formatMoney(
                    resolved.combination.perPersonPrice,
                    resolved.combination.currency,
                  )}{' '}
                  per hotel-paying guest
                </p>
                <div className="mt-4 rounded-lg bg-slate-50 p-3">
                  <p className="mb-2 text-xs font-black uppercase text-slate-500">
                    Payment method
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
            <div className="space-y-3">
              <input
                value={customer.customerName}
                onChange={(event) => updateCustomer({ customerName: event.target.value })}
                placeholder="Customer name"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <input
                value={customer.customerPhone}
                onChange={(event) => updateCustomer({ customerPhone: event.target.value })}
                placeholder="Phone"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <input
                value={customer.customerEmail}
                onChange={(event) => updateCustomer({ customerEmail: event.target.value })}
                placeholder="Email"
                className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <textarea
                value={customer.note}
                onChange={(event) => updateCustomer({ note: event.target.value })}
                placeholder="Internal/customer note"
                rows={3}
                className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
              />
              <button
                type="button"
                onClick={() => void finaliseSelection()}
                disabled={!resolved || saving}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-black text-white transition hover:bg-[#6f1422] disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Finalise In Sales Mode
              </button>
            </div>
            {savedSelection && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                Selection finalised:{' '}
                {formatMoney(savedSelection.combination.totalPrice, savedSelection.combination.currency)}
              </div>
            )}
            {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}
          </section>
        </aside>
      </div>
    </div>
  )
}
