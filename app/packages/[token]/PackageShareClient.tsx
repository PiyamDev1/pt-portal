'use client'

import Image from 'next/image'
import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Bus,
  CheckCircle2,
  ChevronDown,
  FileText,
  Loader2,
  Plane,
  Send,
  Tag,
} from 'lucide-react'
import type {
  PackageComponentOption,
  PackagePaymentBreakdown,
  PackagePaymentIntent,
  PackagePaymentMethod,
  PackagePassengerPriceBreakdown,
  PackageQuotePayload,
  PackageResolvedSelection,
  TravelPackageQuote,
} from '@/app/types/packages'
import {
  formatMoney,
  getDefaultPackageSelection,
  getFlightOptionPriceDeltas,
  getLinkedFlightGroupsForFlight,
  getLinkedFlightOptionForSelection,
  getLinkedFlightOptionPriceDeltas,
  getPackageDepositPaymentSummary,
  getPackagePassengerPriceBreakdown,
  getPackagePaymentBreakdownTotal,
  isLimitedTimeOfferActive,
  normalizePackagePaymentBreakdown,
  normalizePackageQuotePayload,
  resolvePackageSelection,
} from '@/lib/packageQuote'

type PackageShareClientProps = {
  token: string
}

type QuoteResponse = {
  quote?: TravelPackageQuote
  linkedGroup?: PublicLinkedPackageGroup | null
  error?: string
}

type PublicLinkedFamily = {
  quoteId?: string | null
  familyLabel: string
  quoteTitle?: string | null
  customerName?: string | null
  sharePath?: string | null
  isCurrent: boolean
  pricing: {
    grossPrice: number
    discountTotal: number
    totalPrice: number
    currency: string
    breakdown: PackagePassengerPriceBreakdown
  } | null
}

type PublicLinkedPackageGroup = {
  groupId: string
  groupReference: string
  title: string
  visibilityMode: string
  families: PublicLinkedFamily[]
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

const TERMS_URL = 'https://www.piyamtravel.com/terms-and-conditions'

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
  priceSubLines,
  badges,
  currency,
  onClick,
}: {
  selected: boolean
  title: string
  summary: string
  price: number
  pricingMode?: PackageComponentOption['pricingMode']
  priceLabel?: string
  priceSubLabel?: string
  priceSubLines?: string[]
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
          {priceSubLines && priceSubLines.length > 0 ? (
            <div className="mt-2 space-y-0.5 text-[11px] font-bold leading-4 text-slate-500">
              {priceSubLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : (
            <p className="text-[11px] font-bold text-slate-500">
              {priceSubLabel || (pricingMode === 'per_person' ? 'per person' : 'total')}
            </p>
          )}
          {selected && <CheckCircle2 className="ml-auto mt-2 h-5 w-5 text-[#8b1e2d]" />}
        </div>
      </div>
    </button>
  )
}

function formatDelta(value: number, currency: string) {
  if (Math.abs(value) < 0.005) return 'Included'
  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)} pp`
}

const PAYMENT_BREAKDOWN_FIELDS: Array<{
  key: keyof PackagePaymentBreakdown
  label: string
}> = [
  { key: 'cash', label: 'Cash' },
  { key: 'bankTransfer', label: 'Bank Transfer' },
  { key: 'card', label: 'Credit Card' },
]

const DEPOSIT_PAYMENT_METHODS: Array<{
  value: PackagePaymentMethod
  label: string
}> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Credit Card' },
]

function getVisaQuantity(option: { quantity?: number }, payload: PackageQuotePayload) {
  return option.quantity && option.quantity > 0
    ? option.quantity
    : payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
}

function getPreferredOption<T extends { isDefault?: boolean }>(options: T[]) {
  return options.find((option) => option.isDefault) || options[0] || null
}

function formatUnitDelta(value: number, currency: string) {
  if (Math.abs(value) < 0.005) return 'Included'
  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)} pp`
}

function formatFlightPassengerDeltas(
  payload: PackageQuotePayload,
  option: PackageComponentOption | null,
  baseOption: PackageComponentOption | null,
) {
  const deltas = getFlightOptionPriceDeltas(payload, option, baseOption)
  const parts = [`Adult ${formatUnitDelta(deltas.adult, payload.currency)}`]
  if (payload.childrenPaying + payload.childrenFree > 0) {
    parts.push(`Child 2-12 ${formatUnitDelta(deltas.child, payload.currency)}`)
  }
  if (payload.infants > 0) {
    parts.push(`Infant under 2 ${formatUnitDelta(deltas.infant, payload.currency)}`)
  }
  return parts
}

function formatLinkedFlightPassengerDeltas(
  payload: PackageQuotePayload,
  option: Parameters<typeof getLinkedFlightOptionPriceDeltas>[0],
) {
  const deltas = getLinkedFlightOptionPriceDeltas(option)
  const parts = [`Adult ${formatUnitDelta(deltas.adult, payload.currency)}`]
  if (payload.childrenPaying + payload.childrenFree > 0) {
    parts.push(`Child 2-12 ${formatUnitDelta(deltas.child, payload.currency)}`)
  }
  if (payload.infants > 0) {
    parts.push(`Infant under 2 ${formatUnitDelta(deltas.infant, payload.currency)}`)
  }
  return parts
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

function formatTransportSummary(option: PackageComponentOption) {
  const routeLines = option.transportRoutes?.length
    ? option.transportRoutes.map(
        (route) => `* ${route.routeName}${route.vehicleLabel ? ` (${route.vehicleLabel})` : ''}`,
      )
    : []
  return routeLines.length > 0 ? routeLines.join('\n') : option.summary
}

function LinkedFamilyPriceCard({ family, index }: { family: PublicLinkedFamily; index: number }) {
  return (
    <div className="rounded-xl border border-cyan-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-cyan-900">Family / group {index + 1}:</p>
          <p className="mt-1 text-base font-black text-slate-950">{family.familyLabel}</p>
          {family.customerName && (
            <p className="mt-1 text-xs font-bold text-slate-500">{family.customerName}</p>
          )}
          {family.quoteTitle && (
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
              {family.quoteTitle}
            </p>
          )}
        </div>
        {family.sharePath && !family.isCurrent ? (
          <a
            href={family.sharePath}
            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-black text-cyan-900 transition hover:bg-cyan-100"
          >
            View quote
          </a>
        ) : family.isCurrent ? (
          <span className="inline-flex min-h-9 items-center rounded-lg bg-cyan-900 px-3 text-xs font-black text-white">
            Current quote
          </span>
        ) : (
          <span className="inline-flex min-h-9 items-center rounded-lg bg-slate-100 px-3 text-xs font-bold text-slate-500">
            Link unavailable
          </span>
        )}
      </div>

      {family.pricing ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-black uppercase text-slate-500">Subtotal</p>
              <p className="mt-1 font-black text-slate-950">
                {formatMoney(family.pricing.grossPrice, family.pricing.currency)}
              </p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-xs font-black uppercase text-emerald-700">Discount applied</p>
              <p className="mt-1 font-black text-emerald-800">
                {family.pricing.discountTotal > 0
                  ? `-${formatMoney(family.pricing.discountTotal, family.pricing.currency)}`
                  : 'None'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-900 p-3 text-white">
              <p className="text-xs font-black uppercase text-slate-300">Total</p>
              <p className="mt-1 font-black">
                {formatMoney(family.pricing.totalPrice, family.pricing.currency)}
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="mb-2 text-xs font-black uppercase text-slate-500">Breakdown</p>
            <div className="space-y-2">
              {family.pricing.breakdown.adultTotal > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="font-bold text-slate-600">Adult 12+</span>
                  <span className="font-black text-slate-950">
                    {formatMoney(family.pricing.breakdown.adult, family.pricing.currency)} pp
                  </span>
                </div>
              )}
              {family.pricing.breakdown.childTotal > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="font-bold text-slate-600">Child 5+</span>
                  <span className="font-black text-slate-950">
                    {formatMoney(family.pricing.breakdown.child, family.pricing.currency)} pp
                  </span>
                </div>
              )}
              {family.pricing.breakdown.childTwoToFourTotal > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="font-bold text-slate-600">Child 2-4</span>
                  <span className="font-black text-slate-950">
                    {formatMoney(family.pricing.breakdown.childTwoToFour, family.pricing.currency)}{' '}
                    pp
                  </span>
                </div>
              )}
              {family.pricing.breakdown.infantTotal > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="font-bold text-slate-600">Infant under 2</span>
                  <span className="font-black text-slate-950">
                    {formatMoney(family.pricing.breakdown.infant, family.pricing.currency)} pp
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-600">
          This linked quote is not currently available through a customer link.
        </p>
      )}
    </div>
  )
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
  const [linkedGroup, setLinkedGroup] = useState<PublicLinkedPackageGroup | null>(null)
  const [reviewingPayment, setReviewingPayment] = useState(false)
  const [paymentIntent, setPaymentIntent] = useState<PackagePaymentIntent>('full_payment')
  const [depositPaymentMethod, setDepositPaymentMethod] =
    useState<PackagePaymentMethod>('bank_transfer')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [priceSummaryExpanded, setPriceSummaryExpanded] = useState(false)

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
        setLinkedGroup(data.linkedGroup || null)
        setSelection(firstSelections(normalized))
        setCustomer({
          customerName: data.quote.customer_name || normalized.customerName,
          customerPhone: data.quote.customer_phone || normalized.customerPhone,
          customerEmail: data.quote.customer_email || normalized.customerEmail,
          note: '',
        })
        setSavedSelection(data.quote.selected_option)
        setReviewingPayment(false)
        setPaymentIntent('full_payment')
        setDepositPaymentMethod('bank_transfer')
        setTermsAccepted(false)
        setPromoCode('')
        setPriceSummaryExpanded(false)
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

  const priceBreakdown = useMemo(() => {
    if (!payload || !resolved) return null
    return getPackagePassengerPriceBreakdown(payload, resolved.combination)
  }, [payload, resolved])

  const depositPaymentSummary = useMemo(() => {
    if (!payload) return null
    return getPackageDepositPaymentSummary(payload, depositPaymentMethod)
  }, [depositPaymentMethod, payload])

  const visibleOffers = useMemo(() => {
    if (!payload) return []
    return payload.limitedTimeOffers.filter((offer) => offer.active)
  }, [payload])

  const updateCustomer = (changes: Partial<CustomerFields>) => {
    setCustomer((current) => ({ ...current, ...changes }))
  }

  const continueToPaymentReview = () => {
    if (!resolved) return
    setError(null)
    setReviewingPayment(true)
  }

  const submitSelection = async () => {
    if (!payload || !selection || !resolved || !paymentBreakdown) return
    if (!termsAccepted) {
      setError('Please confirm that you have read the terms and conditions.')
      return
    }
    if (paymentIntent === 'full_payment' && !paymentBreakdownBalanced) {
      setError('Payment breakdown must match the package subtotal before finalising.')
      return
    }
    if (
      paymentIntent === 'deposit_only' &&
      (!payload.depositRequired || (payload.depositAmount || 0) <= 0)
    ) {
      setError('Deposit-only payment is not available for this quote.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/packages/share/${encodeURIComponent(token)}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selection,
          paymentMethod:
            paymentIntent === 'full_payment'
              ? pickMethodFromBreakdown(paymentBreakdown)
              : paymentIntent === 'deposit_only'
                ? depositPaymentMethod
                : 'bank_transfer',
          paymentBreakdown: paymentIntent === 'full_payment' ? paymentBreakdown : null,
          paymentIntent,
          installmentRequested: paymentIntent === 'installment_request',
          depositPaymentMethod: paymentIntent === 'deposit_only' ? depositPaymentMethod : null,
          termsAccepted,
          ...customer,
          note: buildSelectionNote(customer.note, promoCode),
        }),
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
            <span className="rounded-lg bg-white/10 px-3 py-1 font-bold">
              {payload.packageType}
            </span>
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

      {linkedGroup && linkedGroup.families.length > 0 && (
        <section className="border-b border-cyan-200 bg-cyan-50 px-4 py-5">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase text-cyan-900">Linked package group</p>
                <h2 className="mt-1 text-xl font-black text-slate-950">{linkedGroup.title}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  {linkedGroup.groupReference}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {linkedGroup.families.map((family, index) =>
                  family.sharePath && !family.isCurrent ? (
                    <a
                      key={`${family.quoteId || family.familyLabel}-${index}`}
                      href={family.sharePath}
                      className="rounded-lg border border-cyan-200 bg-white px-3 py-2 text-xs font-black text-cyan-900 transition hover:bg-cyan-100"
                    >
                      Family / group {index + 1}
                    </a>
                  ) : (
                    <span
                      key={`${family.quoteId || family.familyLabel}-${index}`}
                      className={`rounded-lg px-3 py-2 text-xs font-black ${
                        family.isCurrent ? 'bg-cyan-900 text-white' : 'bg-white text-slate-500'
                      }`}
                    >
                      Family / group {index + 1}
                    </span>
                  ),
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {linkedGroup.families.map((family, index) => (
                <LinkedFamilyPriceCard
                  key={`${family.quoteId || family.familyLabel}-${index}`}
                  family={family}
                  index={index}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {reviewingPayment && resolved ? (
        <div className="mx-auto max-w-6xl px-4 py-5">
          <button
            type="button"
            onClick={() => setReviewingPayment(false)}
            className="text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            Back to package options
          </button>

          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="border-b border-slate-200 pb-4">
                <p className="text-xs font-black uppercase text-slate-500">Your selection</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950">{payload.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Review the package options you selected before sending this to an agent.
                </p>
              </div>

              <div className="mt-4 space-y-3">
                {resolved.combination.flightOption && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <Plane className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase text-slate-500">Flight</p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {resolved.combination.flightOption.title || 'Selected flight'}
                        </p>
                        {resolved.combination.flightOption.summary && (
                          <SummaryText value={resolved.combination.flightOption.summary} />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {resolved.combination.visaOptions.length > 0 && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <FileText className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase text-emerald-700">Visa</p>
                        <div className="mt-2 space-y-2">
                          {resolved.combination.visaOptions.map((option) => (
                            <div key={option.id}>
                              <p className="text-sm font-black text-slate-950">
                                {getVisaQuantity(option, payload)} x {option.title || 'Visa'}
                              </p>
                              {option.summary && <SummaryText value={option.summary} />}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {resolved.combination.transportOption && (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                        <Bus className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase text-slate-500">Transport</p>
                        <p className="mt-1 text-sm font-black text-slate-950">
                          {resolved.combination.transportOption.title || 'Selected transport'}
                        </p>
                        <SummaryText
                          value={formatTransportSummary(resolved.combination.transportOption)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black uppercase text-slate-500">Hotels</p>
                      <div className="mt-2 space-y-3">
                        {resolved.combination.staySelections.map((stay) => (
                          <div key={stay.groupId}>
                            <p className="text-sm font-black text-slate-950">
                              {stay.groupLabel}: {stay.option.title || 'Selected hotel'}
                            </p>
                            {stay.option.summary && <SummaryText value={stay.option.summary} />}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {promoCode.trim() && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="text-xs font-black uppercase text-slate-500">
                      Promo code requested
                    </p>
                    <p className="mt-1 font-black text-slate-950">{promoCode.trim()}</p>
                  </div>
                )}

                {customer.note.trim() && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                    <p className="text-xs font-black uppercase text-slate-500">Your notes</p>
                    <p className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">
                      {customer.note.trim()}
                    </p>
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-black uppercase text-slate-500">Payment option</p>
                <div className="mt-2 rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-600">Total package</span>
                    <span className="text-lg font-black text-slate-950">
                      {formatMoney(resolved.combination.totalPrice, resolved.combination.currency)}
                    </span>
                  </div>
                  {payload.depositRequired && (payload.depositAmount || 0) > 0 && (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-600">Minimum deposit</span>
                      <span className="text-sm font-black text-slate-950">
                        {formatMoney(payload.depositAmount || 0, payload.currency)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 grid gap-2">
                  {[
                    [
                      'full_payment',
                      'Pay full amount',
                      'Choose how much by cash, bank transfer, or card.',
                    ],
                    [
                      'deposit_only',
                      'Pay deposit only',
                      'Choose one payment method for the full deposit amount.',
                    ],
                    [
                      'installment_request',
                      'Request installments',
                      'Subject to availability. We only have 5 customer installment slots.',
                    ],
                  ].map(([value, title, description]) => {
                    const disabled =
                      value === 'deposit_only' &&
                      (!payload.depositRequired || (payload.depositAmount || 0) <= 0)
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={disabled}
                        onClick={() => setPaymentIntent(value as PackagePaymentIntent)}
                        className={`rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${
                          paymentIntent === value
                            ? 'border-[#8b1e2d] bg-red-50'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <p className="text-sm font-black text-slate-950">{title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{description}</p>
                      </button>
                    )
                  })}
                </div>

                {paymentIntent === 'full_payment' && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-black uppercase text-slate-500">
                      Payment breakdown
                    </p>
                    <p className="mb-3 text-xs font-semibold text-slate-500">
                      Split the package subtotal. Any Credit Card processing fee is added
                      separately.
                    </p>
                    <div className="grid gap-2">
                      {PAYMENT_BREAKDOWN_FIELDS.map((field) => {
                        const value = paymentBreakdown?.[field.key] || ''
                        const processingFeeAmount =
                          field.key === 'card'
                            ? (Number(value || 0) * payload.cardProcessingFeePercent) / 100
                            : 0
                        return (
                          <label key={field.key} className="block">
                            <span className="mb-1 flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                              <span>{field.label}</span>
                              {field.key === 'card' && payload.cardProcessingFeePercent > 0 ? (
                                <span className="text-blue-700">
                                  Processing fee{' '}
                                  {processingFeeAmount > 0
                                    ? `+${formatMoney(processingFeeAmount, payload.currency)}`
                                    : `+${payload.cardProcessingFeePercent}%`}
                                </span>
                              ) : null}
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
                    {(paymentBreakdown?.cash || 0) > 0 ||
                    (paymentBreakdown?.bankTransfer || 0) > 0 ? (
                      <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-800">
                        Cash or bank transfer must be paid before the office closes. The agent will
                        confirm the deadline and payment details.
                      </p>
                    ) : null}
                  </div>
                )}

                {paymentIntent === 'deposit_only' && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    <p className="font-black">Deposit payment method</p>
                    <p className="mt-1 text-xs font-bold">
                      Choose one payment method for the full deposit amount. Deposits are
                      non-refundable and cannot be split across multiple payment methods.
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      {DEPOSIT_PAYMENT_METHODS.map((method) => (
                        <button
                          key={method.value}
                          type="button"
                          onClick={() => setDepositPaymentMethod(method.value)}
                          className={`min-h-10 rounded-lg border px-3 text-sm font-black transition ${
                            depositPaymentMethod === method.value
                              ? 'border-[#8b1e2d] bg-white text-[#8b1e2d]'
                              : 'border-amber-200 bg-white/70 text-amber-950 hover:bg-white'
                          }`}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                    <label className="mt-3 block">
                      <span className="mb-1 flex items-center justify-between gap-3 text-xs font-bold text-amber-900">
                        <span>Deposit amount payable</span>
                        {depositPaymentMethod === 'card' &&
                        depositPaymentSummary &&
                        depositPaymentSummary.processingFee > 0 ? (
                          <span className="text-blue-700">
                            Processing fee +
                            {formatMoney(depositPaymentSummary.processingFee, payload.currency)} (
                            {payload.cardProcessingFeePercent}%)
                          </span>
                        ) : null}
                      </span>
                      <div className="flex min-h-10 items-center rounded-lg border border-amber-200 bg-white px-3">
                        <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                        <input
                          readOnly
                          value={(depositPaymentSummary?.total || 0).toFixed(2)}
                          className="w-full bg-transparent text-sm font-bold outline-none"
                        />
                      </div>
                    </label>
                    {depositPaymentSummary && depositPaymentSummary.depositAmount > 0 && (
                      <p className="mt-2 text-xs font-bold text-amber-900">
                        Base deposit:{' '}
                        {formatMoney(depositPaymentSummary.depositAmount, payload.currency)}
                        {depositPaymentSummary.processingFee > 0
                          ? ` + ${formatMoney(depositPaymentSummary.processingFee, payload.currency)} non-refundable Credit Card processing fee`
                          : ''}
                      </p>
                    )}
                  </div>
                )}

                {paymentIntent === 'installment_request' && (
                  <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
                    Your installment request will be sent to an agent. Installments are not
                    guaranteed because only 5 customer installment slots are available.
                  </div>
                )}
              </section>

              <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-[#8b1e2d] focus:ring-[#8b1e2d]"
                />
                <span className="leading-6 text-slate-700">
                  I have read and agree to the{' '}
                  <a
                    href={TERMS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="font-black text-[#8b1e2d] underline"
                  >
                    terms and conditions
                  </a>
                  .
                </span>
              </label>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setReviewingPayment(false)}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-black text-slate-700"
                >
                  Edit package
                </button>
                <button
                  type="button"
                  onClick={() => void submitSelection()}
                  disabled={
                    saving ||
                    !termsAccepted ||
                    (paymentIntent === 'full_payment' && !paymentBreakdownBalanced)
                  }
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-4 text-sm font-black text-white transition hover:bg-[#6f1422] disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send to Agent for Review
                </button>
              </div>

              {savedSelection && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                  Your selection and payment preference have been sent to Piyam Travel. An agent
                  will review it and confirm your bookings and reservation within the next hour.
                </div>
              )}
              {error && <p className="mt-3 text-sm font-bold text-red-600">{error}</p>}
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm font-semibold leading-6 text-blue-900">
                The agent will confirm your bookings and reservation within the next hour. The
                quotation price is not final and may be subject to change depending on availability.
                We can only confirm costs once reservations have been put in place.
              </div>
            </aside>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl px-4 py-5">
          <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-900 shadow-sm">
            Advice: to get the best price possible, please make flight reservations first.
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-5">
              {payload.flightOptions.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <SectionTitle icon={Plane} title="Flights" />
                  <div className="space-y-3">
                    {payload.flightOptions.map((option) => {
                      const defaultFlight = getPreferredOption(payload.flightOptions)
                      const deltas = getFlightOptionPriceDeltas(payload, option, defaultFlight)
                      return (
                        <OptionButton
                          key={option.id}
                          selected={selection.flightOptionId === option.id}
                          title={option.title}
                          summary={formatTransportSummary(option)}
                          price={option.price}
                          priceLabel={formatDelta(deltas.adult, payload.currency)}
                          priceSubLines={formatFlightPassengerDeltas(
                            payload,
                            option,
                            defaultFlight,
                          )}
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
                  {getLinkedFlightGroupsForFlight(
                    payload,
                    payload.flightOptions.find(
                      (option) => option.id === selection.flightOptionId,
                    ) || null,
                  ).length > 0 && (
                    <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                      {getLinkedFlightGroupsForFlight(
                        payload,
                        payload.flightOptions.find(
                          (option) => option.id === selection.flightOptionId,
                        ) || null,
                      ).map((group) => (
                        <div key={group.id}>
                          <p className="mb-2 text-xs font-black uppercase text-slate-500">
                            {group.routeLabel}
                          </p>
                          <div className="space-y-2">
                            {group.options.map((option) => {
                              const selectedOption = getLinkedFlightOptionForSelection(
                                group,
                                selection.linkedFlightOptionIds,
                              )
                              return (
                                <OptionButton
                                  key={option.id}
                                  selected={selectedOption?.id === option.id}
                                  title={option.airlineName}
                                  summary={option.summary}
                                  price={option.adultDelta}
                                  priceLabel={
                                    option.isDefault
                                      ? 'Included'
                                      : formatDelta(option.adultDelta, payload.currency)
                                  }
                                  priceSubLines={formatLinkedFlightPassengerDeltas(payload, option)}
                                  pricingMode="per_person"
                                  currency={payload.currency}
                                  onClick={() =>
                                    setSelection((current) =>
                                      current
                                        ? {
                                            ...current,
                                            linkedFlightOptionIds: {
                                              ...(current.linkedFlightOptionIds || {}),
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
                  )}
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
                      const servicePassengers =
                        payload.adults +
                        payload.childrenPaying +
                        payload.childrenFree +
                        payload.infants
                      const perPassengerDelta =
                        servicePassengers > 0 ? delta / servicePassengers : delta
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
                          priceLabel={formatDelta(perPassengerDelta, payload.currency)}
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
                          const payingGuests = payload.adults + payload.childrenPaying
                          const perPersonDelta = payingGuests > 0 ? delta / payingGuests : delta
                          return (
                            <OptionButton
                              key={option.id}
                              selected={selection.stayOptionIds[group.id] === option.id}
                              title={option.title}
                              summary={option.summary}
                              price={option.price}
                              priceLabel={formatDelta(perPersonDelta, payload.currency)}
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
                            active
                              ? 'border-emerald-200 bg-emerald-50'
                              : 'border-slate-200 bg-slate-50'
                          }`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-sm font-black text-slate-950">{offer.title}</p>
                              {offer.summary && <SummaryText value={offer.summary} />}
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
                {resolved ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setPriceSummaryExpanded((current) => !current)}
                      aria-expanded={priceSummaryExpanded}
                      className="flex w-full items-start justify-between gap-3 text-left"
                    >
                      <span>
                        <span className="block text-sm font-black text-slate-950">
                          Price summary
                        </span>
                        <span className="mt-1 block text-xs font-bold text-slate-500">
                          Expand this window to see the full price breakdown
                        </span>
                      </span>
                      <ChevronDown
                        className={`mt-0.5 h-5 w-5 shrink-0 text-slate-500 transition ${
                          priceSummaryExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-bold text-slate-600">Package subtotal</span>
                        <span className="font-black text-slate-950">
                          {formatMoney(
                            resolved.combination.grossPrice,
                            resolved.combination.currency,
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-emerald-700">
                        <span className="font-bold">Discounts applied</span>
                        <span className="font-black">
                          {resolved.combination.offerDiscountTotal > 0
                            ? `-${formatMoney(
                                resolved.combination.offerDiscountTotal,
                                resolved.combination.currency,
                              )}`
                            : 'None'}
                        </span>
                      </div>
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
                      {!priceSummaryExpanded && (
                        <p className="text-xs font-semibold leading-5 text-slate-500">
                          Expand this window to see passenger prices and additional payment charges.
                        </p>
                      )}
                      {priceSummaryExpanded && (
                        <>
                          {resolved.combination.paymentSurchargeTotal > 0 ? (
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-bold text-slate-600">
                                Credit Card processing fee
                              </span>
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
                        </>
                      )}
                    </div>

                    {priceSummaryExpanded && (
                      <>
                        <p className="mt-3 text-xs font-black uppercase text-slate-500">
                          Passenger prices
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-600">
                          Adult, child, and infant prices are listed below.
                        </p>

                        {priceBreakdown && (
                          <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                            <p className="text-xs font-black uppercase text-slate-500">
                              Passenger pricing
                            </p>
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
                                <span className="font-bold text-slate-600">Child 2-5</span>
                                <span className="font-black text-slate-950">
                                  {formatMoney(
                                    priceBreakdown.childTwoToFour,
                                    priceBreakdown.currency,
                                  )}{' '}
                                  each
                                </span>
                              </div>
                            )}
                            {payload.infants > 0 && (
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-bold text-slate-600">Infant under 2</span>
                                <span className="font-black text-slate-950">
                                  {formatMoney(priceBreakdown.infant, priceBreakdown.currency)} each
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        {resolved.combination.paymentSurchargeTotal > 0 && (
                          <p className="mt-2 text-xs font-semibold text-slate-500">
                            Credit Card processing fees are non-refundable.
                          </p>
                        )}
                        {resolved.combination.servicePassengers !==
                          resolved.combination.payingGuests && (
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Services calculated for {resolved.combination.servicePassengers}{' '}
                            passengers.
                          </p>
                        )}
                        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                          Payment options, deposits, installment requests, and terms are reviewed on
                          the next step.
                        </p>
                      </>
                    )}

                    <label className="mt-4 block">
                      <span className="mb-1 block text-xs font-black uppercase text-slate-500">
                        Promo code
                      </span>
                      <input
                        value={promoCode}
                        onChange={(event) => setPromoCode(event.target.value)}
                        placeholder="Enter promo code if you have one"
                        className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                      />
                    </label>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-red-600">Selection is incomplete.</p>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-sm font-black text-slate-950">Your contact details</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-500">Lead name</span>
                    <input
                      value={customer.customerName}
                      onChange={(event) => updateCustomer({ customerName: event.target.value })}
                      placeholder="Your full name"
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
                      placeholder="Your WhatsApp number"
                      className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-500">
                      Email address
                    </span>
                    <input
                      value={customer.customerEmail}
                      onChange={(event) => updateCustomer({ customerEmail: event.target.value })}
                      placeholder="Your email address"
                      className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-bold text-slate-500">
                      Requirements and notes
                    </span>
                    <textarea
                      value={customer.note}
                      onChange={(event) => updateCustomer({ note: event.target.value })}
                      placeholder="Tell us about wheelchair assistance, dietary requirements, room preferences, mobility needs, special assistance, or anything else we should know."
                      rows={4}
                      className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
                    />
                  </label>
                  <p className="rounded-lg bg-slate-50 p-3 text-xs font-semibold leading-5 text-slate-600">
                    Continue to review your payment preference before sending this to Piyam Travel.
                    This is not a confirmed booking until availability is checked and reservations
                    are completed by an agent. Passport copies should be sent via WhatsApp.
                  </p>
                  <button
                    type="button"
                    onClick={continueToPaymentReview}
                    disabled={!resolved}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-black text-white transition hover:bg-[#6f1422] disabled:opacity-50"
                  >
                    Review Payment
                  </button>
                </div>
                {savedSelection && (
                  <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800">
                    Selection sent to Piyam Travel:{' '}
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
      )}
    </main>
  )
}
