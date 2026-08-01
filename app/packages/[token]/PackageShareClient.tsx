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
  PackageSelectionInput,
  PackageVisaPassengerCategory,
  TravelPackageQuote,
} from '@/app/types/packages'
import {
  buildPackagePresetSelections,
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
  sortPackageOptionsLowToHigh,
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
  payload?: PackageQuotePayload | null
  baseSelection?: PackageSelectionInput | null
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

type PaymentReviewScope = 'current' | 'group'

type SelectionResponse = {
  selected?: PackageResolvedSelection
  saveOnly?: boolean
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

function formatSelectionDelta(value: number, currency: string) {
  if (Math.abs(value) < 0.005) return `+${formatMoney(0, currency)} pp`
  return formatDelta(value, currency)
}

function formatSignedHotelExtraPrice(value: number, currency: string) {
  if (Math.abs(value) < 0.005) return formatMoney(0, currency)
  return `${value > 0 ? '+' : '-'}${formatMoney(Math.abs(value), currency)}`
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

function getVisaPassengerCategoryCount(
  option: { visaPassengerCategory?: PackageVisaPassengerCategory },
  payload: PackageQuotePayload,
) {
  if (option.visaPassengerCategory === 'adult') return payload.adults
  if (option.visaPassengerCategory === 'child_5_plus') return payload.childrenPaying
  if (option.visaPassengerCategory === 'child_2_to_4') return payload.childrenFree
  if (option.visaPassengerCategory === 'infant') return payload.infants
  return payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
}

function getVisaQuantity(
  option: { quantity?: number; visaPassengerCategory?: PackageVisaPassengerCategory },
  payload: PackageQuotePayload,
) {
  return option.quantity && option.quantity > 0
    ? option.quantity
    : getVisaPassengerCategoryCount(option, payload)
}

function getVisaPassengerCategoryLabel(category: PackageVisaPassengerCategory | undefined) {
  if (category === 'adult') return 'Adult'
  if (category === 'child_5_plus') return 'Child 5+'
  if (category === 'child_2_to_4') return 'Child 2-4'
  if (category === 'infant') return 'Infant'
  return 'Traveller'
}

function getPreferredOption<T extends { isDefault?: boolean }>(options: T[]) {
  return options.find((option) => option.isDefault) || options[0] || null
}

function formatUnitDelta(value: number, currency: string) {
  return formatSelectionDelta(value, currency)
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
  baseOption?: Parameters<typeof getLinkedFlightOptionPriceDeltas>[1],
) {
  const deltas = getLinkedFlightOptionPriceDeltas(option, baseOption)
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

function buildSelectionNote(note: string, promoCode: string, ...extraNotes: string[]) {
  const parts = [note.trim()]
  if (promoCode.trim()) parts.push(`Promo code requested: ${promoCode.trim()}`)
  parts.push(...extraNotes.map((extraNote) => extraNote.trim()).filter(Boolean))
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

function getLinkedFamilyLabel(family: PublicLinkedFamily, index: number) {
  return `Family / group ${index + 1}${family.familyLabel ? `: ${family.familyLabel}` : ''}`
}

function getPricingSubtotal(pricing: PublicLinkedFamily['pricing']) {
  if (!pricing) return 0
  return Math.max(0, pricing.grossPrice - pricing.discountTotal)
}

function normalizeMatchValue(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function resolveLinkedFamilySelection(
  family: PublicLinkedFamily,
  currentPayload: PackageQuotePayload,
  currentSelection: PackageSelectionInput,
  matchHotels: boolean,
) {
  if (!family.payload) return null

  try {
    const targetPayload = normalizePackageQuotePayload(family.payload)
    const baseSelection = family.baseSelection || getDefaultPackageSelection(targetPayload)
    const sourceGroups = currentPayload.stayGroups
    const targetStayOptionIds = matchHotels
      ? Object.fromEntries(
          targetPayload.stayGroups.map((targetGroup, groupIndex) => {
            const sourceGroup = sourceGroups[groupIndex]
            const sourceOptionId = sourceGroup
              ? currentSelection.stayOptionIds[sourceGroup.id]
              : ''
            const sourceOption = sourceGroup?.options.find(
              (option) => option.id === sourceOptionId,
            )
            const sourceTitle = normalizeMatchValue(sourceOption?.title || '')
            const matchedByTitle = sourceTitle
              ? targetGroup.options.find(
                  (option) => normalizeMatchValue(option.title) === sourceTitle,
                )
              : null
            const fallbackOption =
              targetGroup.options.find(
                (option) => option.id === baseSelection.stayOptionIds?.[targetGroup.id],
              ) ||
              targetGroup.options.find((option) => option.isDefault) ||
              targetGroup.options[0]

            return [targetGroup.id, (matchedByTitle || fallbackOption)?.id || '']
          }),
        )
      : baseSelection.stayOptionIds
    const targetHotelAddonOptionIds = matchHotels
      ? Object.fromEntries(
          targetPayload.stayGroups
            .map((targetGroup, groupIndex) => {
              const sourceGroup = sourceGroups[groupIndex]
              if (!sourceGroup) return null
              const sourceOptionId = currentSelection.stayOptionIds[sourceGroup.id]
              const sourceOption = sourceGroup.options.find(
                (option) => option.id === sourceOptionId,
              )
              const sourceAddonIds = currentSelection.hotelAddonOptionIds?.[sourceGroup.id] || []
              if (!sourceOption || sourceAddonIds.length === 0) return null

              const targetOptionId = targetStayOptionIds[targetGroup.id]
              const targetOption = targetGroup.options.find((option) => option.id === targetOptionId)
              if (!targetOption) return null

              const matchedAddonIds = sourceAddonIds
                .map((sourceAddonId) => {
                  const sourceAddon = sourceOption.hotelAddonOptions?.find(
                    (addon) => addon.id === sourceAddonId,
                  )
                  const sourceAddonLabel = normalizeMatchValue(sourceAddon?.label || '')
                  if (!sourceAddonLabel) return ''
                  return (
                    targetOption.hotelAddonOptions?.find(
                      (addon) => normalizeMatchValue(addon.label) === sourceAddonLabel,
                    )?.id || ''
                  )
                })
                .filter(Boolean)

              return matchedAddonIds.length > 0 ? [targetGroup.id, matchedAddonIds] : null
            })
            .filter((value): value is [string, string[]] => Boolean(value)),
        )
      : baseSelection.hotelAddonOptionIds || {}

    const resolved = resolvePackageSelection(targetPayload, {
      ...baseSelection,
      stayOptionIds: targetStayOptionIds,
      hotelAddonOptionIds: targetHotelAddonOptionIds,
      paymentBreakdown: null,
      paymentMethod: 'bank_transfer',
    })

    return { payload: targetPayload, resolved }
  } catch {
    return null
  }
}

function getLinkedFamilyPricing(
  family: PublicLinkedFamily,
  currentPayload: PackageQuotePayload,
  currentSelection: PackageSelectionInput,
  matchHotels: boolean,
) {
  if (!matchHotels || !family.payload || !family.baseSelection) return family.pricing

  const result = resolveLinkedFamilySelection(
    family,
    currentPayload,
    currentSelection,
    matchHotels,
  )
  if (!result) {
    return family.pricing
  }

  const breakdown = getPackagePassengerPriceBreakdown(result.payload, result.resolved.combination)

  return {
    grossPrice: result.resolved.combination.grossPrice,
    discountTotal: result.resolved.combination.offerDiscountTotal,
    totalPrice: result.resolved.combination.totalPrice,
    currency: result.resolved.combination.currency,
    breakdown,
  }
}

function PassengerPricingRows({
  breakdown,
  currency,
}: {
  breakdown: PackagePassengerPriceBreakdown
  currency: string
}) {
  return (
    <div className="space-y-2">
      {breakdown.adultTotal > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-slate-600">Adult 12+</span>
          <span className="font-black text-slate-950">
            {formatMoney(breakdown.adult, currency)} each
          </span>
        </div>
      )}
      {breakdown.childTotal > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-slate-600">Child 5+</span>
          <span className="font-black text-slate-950">
            {formatMoney(breakdown.child, currency)} each
          </span>
        </div>
      )}
      {breakdown.childTwoToFourTotal > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-slate-600">Child 2-5</span>
          <span className="font-black text-slate-950">
            {formatMoney(breakdown.childTwoToFour, currency)} each
          </span>
        </div>
      )}
      {breakdown.infantTotal > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="font-bold text-slate-600">Infant under 2</span>
          <span className="font-black text-slate-950">
            {formatMoney(breakdown.infant, currency)} each
          </span>
        </div>
      )}
      {breakdown.visaLines && breakdown.visaLines.length > 0 && (
        <div className="border-t border-slate-200 pt-2">
          <p className="mb-2 text-xs font-black uppercase text-slate-500">Visa allocation</p>
          <div className="space-y-2">
            {breakdown.visaLines.map((line) => (
              <div
                key={`${line.optionId}-${line.category}`}
                className="flex items-start justify-between gap-3 text-xs"
              >
                <span className="font-bold text-slate-600">
                  {line.quantity} x {line.categoryLabel} "{line.title}"
                </span>
                <span className="shrink-0 font-black text-slate-950">
                  {formatMoney(line.unitPrice, currency)} pp
                </span>
              </div>
            ))}
          </div>
        </div>
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
  const [paymentScope, setPaymentScope] = useState<PaymentReviewScope>('current')
  const [groupPaymentBreakdown, setGroupPaymentBreakdown] =
    useState<PackagePaymentBreakdown | null>(null)
  const [paymentIntent, setPaymentIntent] = useState<PackagePaymentIntent>('full_payment')
  const [depositPaymentMethod, setDepositPaymentMethod] =
    useState<PackagePaymentMethod>('bank_transfer')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [promoCode, setPromoCode] = useState('')
  const [priceSummaryExpanded, setPriceSummaryExpanded] = useState(false)
  const [matchLinkedHotelOptions, setMatchLinkedHotelOptions] = useState(false)
  const [selectionSaveMessage, setSelectionSaveMessage] = useState('')

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
        setPaymentScope('current')
        setGroupPaymentBreakdown(null)
        setPaymentIntent('full_payment')
        setDepositPaymentMethod('bank_transfer')
        setTermsAccepted(false)
        setPromoCode('')
        setPriceSummaryExpanded(false)
        setMatchLinkedHotelOptions(false)
        setSelectionSaveMessage('')
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

  const orderedStayGroups = useMemo(() => {
    if (!payload) return []
    const order =
      payload.itineraryOrder.length > 0
        ? payload.itineraryOrder
        : payload.stayGroups.map((group) => group.id)
    return [...payload.stayGroups]
      .sort((a, b) => {
        const aIndex = order.indexOf(a.id)
        const bIndex = order.indexOf(b.id)
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex)
      })
      .map((group) => ({
        ...group,
        options: sortPackageOptionsLowToHigh(group.options),
      }))
  }, [payload])

  const priceBreakdown = useMemo(() => {
    if (!payload || !resolved) return null
    return getPackagePassengerPriceBreakdown(payload, resolved.combination)
  }, [payload, resolved])
  const currentLinkedFamilyIndex =
    linkedGroup?.families.findIndex((family) => family.isCurrent) ?? -1
  const currentLinkedFamily =
    currentLinkedFamilyIndex >= 0 ? linkedGroup?.families[currentLinkedFamilyIndex] : null
  const linkedFamilyTotals = useMemo(
    () =>
      linkedGroup && payload && selection
        ? linkedGroup.families
            .map((family, index) => ({ family, index }))
            .filter(({ family }) => !family.isCurrent)
            .flatMap(({ family, index }) => {
              const pricing = getLinkedFamilyPricing(
                family,
                payload,
                selection,
                matchLinkedHotelOptions,
              )
              return pricing ? [{ family, index, pricing }] : []
            })
        : [],
    [linkedGroup, matchLinkedHotelOptions, payload, selection],
  )
  const linkedFamilyReviewSelections = useMemo(
    () =>
      linkedGroup && payload && selection
        ? linkedGroup.families
            .map((family, index) => ({ family, index }))
            .filter(({ family }) => !family.isCurrent)
            .flatMap(({ family, index }) => {
              const result = resolveLinkedFamilySelection(
                family,
                payload,
                selection,
                matchLinkedHotelOptions,
              )
              return result ? [{ family, index, ...result }] : []
            })
        : [],
    [linkedGroup, matchLinkedHotelOptions, payload, selection],
  )
  const canMatchLinkedHotelOptions = linkedFamilyTotals.length > 0
  const canSaveLinkedFamilySelection = Boolean(linkedGroup && linkedGroup.families.length > 1)
  const superGroupTotals = useMemo(() => {
    if (!resolved) return null
    return linkedFamilyTotals.reduce(
      (totals, item) => ({
        grossPrice: totals.grossPrice + item.pricing.grossPrice,
        discountTotal: totals.discountTotal + item.pricing.discountTotal,
        totalPrice: totals.totalPrice + item.pricing.totalPrice,
        currency: totals.currency,
      }),
      {
        grossPrice: resolved.combination.grossPrice,
        discountTotal: resolved.combination.offerDiscountTotal,
        totalPrice: resolved.combination.totalPrice,
        currency: resolved.combination.currency,
      },
    )
  }, [linkedFamilyTotals, resolved])

  const depositPaymentSummary = useMemo(() => {
    if (!payload) return null
    return getPackageDepositPaymentSummary(payload, depositPaymentMethod)
  }, [depositPaymentMethod, payload])
  const canPayForLinkedGroup = Boolean(superGroupTotals && linkedFamilyTotals.length > 0)
  const effectivePaymentScope: PaymentReviewScope =
    canPayForLinkedGroup && paymentScope === 'group' ? 'group' : 'current'
  const groupPaymentSubtotal = superGroupTotals
    ? Math.max(0, superGroupTotals.grossPrice - superGroupTotals.discountTotal)
    : 0
  const paymentTargetSubtotal =
    effectivePaymentScope === 'group'
      ? groupPaymentSubtotal
      : resolved?.combination.packageSubtotalPrice || 0
  const groupPaymentBreakdownForReview = useMemo(
    () =>
      normalizePackagePaymentBreakdown(
        groupPaymentBreakdown,
        paymentTargetSubtotal,
        'bank_transfer',
      ),
    [groupPaymentBreakdown, paymentTargetSubtotal],
  )
  const activePaymentBreakdown =
    effectivePaymentScope === 'group' ? groupPaymentBreakdownForReview : paymentBreakdown
  const activePaymentBreakdownTotal = getPackagePaymentBreakdownTotal(activePaymentBreakdown)
  const activePaymentBreakdownRemaining = paymentTargetSubtotal - activePaymentBreakdownTotal
  const activePaymentBreakdownBalanced =
    !resolved || Math.abs(activePaymentBreakdownRemaining) < 0.01
  const paymentProcessingFeeTotal =
    payload && activePaymentBreakdown
      ? (activePaymentBreakdown.card * payload.cardProcessingFeePercent) / 100
      : 0
  const paymentTargetTotal = paymentTargetSubtotal + paymentProcessingFeeTotal
  const groupDepositPaymentSummary = useMemo(() => {
    if (!payload) return null
    if (effectivePaymentScope !== 'group') return depositPaymentSummary
    const summaries = [
      getPackageDepositPaymentSummary(payload, depositPaymentMethod),
      ...linkedFamilyTotals
        .map(({ family }) =>
          family.payload
            ? getPackageDepositPaymentSummary(family.payload, depositPaymentMethod)
            : null,
        )
        .filter((summary): summary is NonNullable<typeof depositPaymentSummary> =>
          Boolean(summary),
        ),
    ]
    return summaries.reduce(
      (total, summary) => ({
        depositAmount: total.depositAmount + summary.depositAmount,
        processingFee: total.processingFee + summary.processingFee,
        total: total.total + summary.total,
        currency: total.currency,
      }),
      {
        depositAmount: 0,
        processingFee: 0,
        total: 0,
        currency: payload.currency,
      },
    )
  }, [
    depositPaymentMethod,
    depositPaymentSummary,
    effectivePaymentScope,
    linkedFamilyTotals,
    payload,
  ])
  const activeDepositPaymentSummary =
    effectivePaymentScope === 'group' ? groupDepositPaymentSummary : depositPaymentSummary
  const depositPaymentAvailable = Boolean(
    activeDepositPaymentSummary && activeDepositPaymentSummary.depositAmount > 0,
  )

  const visibleOffers = useMemo(() => {
    if (!payload) return []
    return payload.limitedTimeOffers.filter((offer) => offer.active)
  }, [payload])
  const packagePresets = useMemo(
    () => (payload ? buildPackagePresetSelections(payload) : []),
    [payload],
  )

  const applyPackagePreset = (nextSelection: PackageSelectionInput) => {
    setSelection((current) => ({
      ...nextSelection,
      paymentMethod: current?.paymentMethod || nextSelection.paymentMethod || 'bank_transfer',
      paymentBreakdown: current?.paymentBreakdown || null,
      paymentIntent: current?.paymentIntent,
      installmentRequested: current?.installmentRequested,
      depositPaymentMethod: current?.depositPaymentMethod,
      termsAccepted: current?.termsAccepted,
      customerName: current?.customerName,
      customerPhone: current?.customerPhone,
      customerEmail: current?.customerEmail,
      note: current?.note,
    }))
  }

  const updateCustomer = (changes: Partial<CustomerFields>) => {
    setCustomer((current) => ({ ...current, ...changes }))
  }

  const continueToPaymentReview = () => {
    if (!resolved) return
    setError(null)
    setReviewingPayment(true)
  }

  const saveLinkedPackageSelection = async () => {
    if (!payload || !selection || !resolved || !canSaveLinkedFamilySelection) return
    setSaving(true)
    setError(null)
    setSelectionSaveMessage('')
    try {
      const response = await fetch(`/api/packages/share/${encodeURIComponent(token)}/selection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selection,
          paymentMethod: 'bank_transfer',
          paymentBreakdown: null,
          paymentIntent: null,
          installmentRequested: false,
          depositPaymentMethod: null,
          saveOnly: true,
          ...customer,
          note: buildSelectionNote(
            customer.note,
            promoCode,
            canMatchLinkedHotelOptions
              ? `Linked family hotel preference: ${
                  matchLinkedHotelOptions
                    ? 'Customer requested the same hotel options for linked groups.'
                    : 'Customer kept linked group hotel options separate.'
                }`
              : '',
          ),
        }),
      })
      const data = (await response.json()) as SelectionResponse
      if (!response.ok || !data.selected) throw new Error(data.error || 'Unable to save selection')
      const saved = data.selected
      const breakdown = getPackagePassengerPriceBreakdown(payload, saved.combination)
      setSavedSelection(saved)
      setLinkedGroup((current) =>
        current
          ? {
              ...current,
              families: current.families.map((family) =>
                family.isCurrent
                  ? {
                      ...family,
                      baseSelection: saved.selection,
                      pricing: {
                        grossPrice: saved.combination.grossPrice,
                        discountTotal: saved.combination.offerDiscountTotal,
                        totalPrice: saved.combination.totalPrice,
                        currency: saved.combination.currency,
                        breakdown,
                      },
                    }
                  : family,
              ),
            }
          : current,
      )
      setSelectionSaveMessage(
        'Selection saved for this family. You can now open another linked package and save that family separately.',
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save selection')
    } finally {
      setSaving(false)
    }
  }

  const submitSelection = async () => {
    if (!payload || !selection || !resolved || !paymentBreakdown) return
    if (!termsAccepted) {
      setError('Please confirm that you have read the terms and conditions.')
      return
    }
    if (paymentIntent === 'full_payment' && !activePaymentBreakdownBalanced) {
      setError('Payment breakdown must match the selected payment amount before finalising.')
      return
    }
    if (
      paymentIntent === 'deposit_only' &&
      !depositPaymentAvailable
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
              ? pickMethodFromBreakdown(activePaymentBreakdown || paymentBreakdown)
              : paymentIntent === 'deposit_only'
                ? depositPaymentMethod
                : 'bank_transfer',
          paymentBreakdown:
            paymentIntent === 'full_payment' && effectivePaymentScope === 'current'
              ? paymentBreakdown
              : null,
          paymentIntent,
          installmentRequested: paymentIntent === 'installment_request',
          depositPaymentMethod: paymentIntent === 'deposit_only' ? depositPaymentMethod : null,
          termsAccepted,
          ...customer,
          note: buildSelectionNote(
            customer.note,
            promoCode,
            canMatchLinkedHotelOptions
              ? `Linked family hotel preference: ${
                  matchLinkedHotelOptions
                    ? 'Customer requested the same hotel options for linked groups.'
                    : 'Customer kept linked group hotel options separate.'
                }`
              : '',
            canPayForLinkedGroup
              ? [
                  `Payment scope: ${
                    effectivePaymentScope === 'group'
                      ? 'Customer wants to pay for everyone in the linked package group.'
                      : 'Customer wants to pay for this family only.'
                  }`,
                  effectivePaymentScope === 'group' && superGroupTotals
                    ? `Linked group payment total: ${formatMoney(
                        paymentTargetTotal,
                        superGroupTotals.currency,
                      )}`
                    : `Current family payment total: ${formatMoney(
                        paymentTargetTotal,
                        resolved.combination.currency,
                      )}`,
                  paymentIntent === 'full_payment' && activePaymentBreakdown
                    ? `Payment split requested: Cash ${formatMoney(
                        activePaymentBreakdown.cash,
                        resolved.combination.currency,
                      )}, Bank Transfer ${formatMoney(
                        activePaymentBreakdown.bankTransfer,
                        resolved.combination.currency,
                      )}, Credit Card ${formatMoney(
                        activePaymentBreakdown.card,
                        resolved.combination.currency,
                      )}`
                    : '',
                ]
                  .filter(Boolean)
                  .join('\n')
              : '',
          ),
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
            {canSaveLinkedFamilySelection && (
              <div className="mt-4 rounded-xl border border-cyan-200 bg-white p-4 text-sm shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="font-black text-slate-950">Save this family selection</p>
                    <p className="mt-1 leading-6 text-slate-600">
                      Save this linked package before opening another family quote. Flight options
                      may differ between families, so flights need to be manually selected and saved
                      on each linked quote to show an accurate total balance.
                    </p>
                    {selectionSaveMessage && (
                      <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                        {selectionSaveMessage}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void saveLinkedPackageSelection()}
                    disabled={saving || !resolved}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-cyan-900 px-4 text-sm font-black text-white transition hover:bg-cyan-950 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save This Selection
                  </button>
                </div>
              </div>
            )}
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
                <h2 className="mt-1 text-2xl font-black text-slate-950">
                  {effectivePaymentScope === 'group' ? 'Linked group selection' : payload.title}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {effectivePaymentScope === 'group'
                    ? 'Review this package and the linked family selections before sending this to an agent.'
                    : 'Review the package options you selected before sending this to an agent.'}
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
                                {getVisaQuantity(option, payload)} x{' '}
                                {getVisaPassengerCategoryLabel(option.visaPassengerCategory)}{' '}
                                {option.title || 'Visa'}
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
                            {(stay.addonOptions || []).length > 0 && (
                              <div className="mt-2 space-y-1 rounded-lg bg-violet-50 p-2 text-xs font-bold text-violet-900">
                                {(stay.addonOptions || []).map((addon) => (
                                  <p key={addon.id}>
                                    {addon.label}: {formatMoney(addon.price, payload.currency)}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {effectivePaymentScope === 'group' && linkedFamilyReviewSelections.length > 0 && (
                  <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                    <p className="text-xs font-black uppercase text-cyan-900">
                      Linked package selections included
                    </p>
                    <div className="mt-3 space-y-3">
                      {linkedFamilyReviewSelections.map(({ family, index, payload, resolved }) => (
                        <div
                          key={`${family.quoteId || family.familyLabel}-${index}-selection`}
                          className="rounded-lg border border-cyan-100 bg-white p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-black text-slate-950">
                                {getLinkedFamilyLabel(family, index)}
                              </p>
                              {family.quoteTitle && (
                                <p className="mt-1 text-xs font-semibold text-slate-500">
                                  {family.quoteTitle}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 text-sm font-black text-slate-950">
                              {formatMoney(
                                resolved.combination.packageSubtotalPrice,
                                resolved.combination.currency,
                              )}
                            </span>
                          </div>

                          <div className="mt-3 grid gap-3 text-sm">
                            {resolved.combination.flightOption && (
                              <div>
                                <p className="text-xs font-black uppercase text-slate-500">
                                  Flight
                                </p>
                                <p className="mt-1 font-black text-slate-950">
                                  {resolved.combination.flightOption.title || 'Selected flight'}
                                </p>
                                {resolved.combination.flightOption.summary && (
                                  <SummaryText value={resolved.combination.flightOption.summary} />
                                )}
                              </div>
                            )}

                            {resolved.combination.transportOption && (
                              <div>
                                <p className="text-xs font-black uppercase text-slate-500">
                                  Transport
                                </p>
                                <p className="mt-1 font-black text-slate-950">
                                  {resolved.combination.transportOption.title ||
                                    'Selected transport'}
                                </p>
                                <SummaryText
                                  value={formatTransportSummary(
                                    resolved.combination.transportOption,
                                  )}
                                />
                              </div>
                            )}

                            {resolved.combination.visaOptions.length > 0 && (
                              <div>
                                <p className="text-xs font-black uppercase text-emerald-700">
                                  Visa
                                </p>
                                <div className="mt-1 space-y-1">
                                  {resolved.combination.visaOptions.map((option) => (
                                    <p key={option.id} className="font-black text-slate-950">
                                      {getVisaQuantity(option, payload)} x{' '}
                                      {getVisaPassengerCategoryLabel(
                                        option.visaPassengerCategory,
                                      )}{' '}
                                      {option.title || 'Visa'}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div>
                              <p className="text-xs font-black uppercase text-slate-500">
                                Hotels
                              </p>
                              <div className="mt-1 space-y-2">
                                {resolved.combination.staySelections.map((stay) => (
                                  <div key={stay.groupId}>
                                    <p className="font-black text-slate-950">
                                      {stay.groupLabel}: {stay.option.title || 'Selected hotel'}
                                    </p>
                                    {stay.option.summary && (
                                      <SummaryText value={stay.option.summary} />
                                    )}
                                    {(stay.addonOptions || []).length > 0 && (
                                      <div className="mt-1 space-y-1 rounded-lg bg-violet-50 p-2 text-xs font-bold text-violet-900">
                                        {(stay.addonOptions || []).map((addon) => (
                                          <p key={addon.id}>
                                            {addon.label}:{' '}
                                            {formatMoney(addon.price, payload.currency)}
                                          </p>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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
                {canPayForLinkedGroup && (
                  <div className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
                    <p className="text-xs font-black uppercase text-cyan-900">
                      Who are you paying for?
                    </p>
                    <div className="mt-2 grid gap-2">
                      {[
                        {
                          value: 'current' as const,
                          title: currentLinkedFamily
                            ? getLinkedFamilyLabel(currentLinkedFamily, currentLinkedFamilyIndex)
                            : 'This family only',
                          description: 'Only send the payment preference for this package.',
                        },
                        {
                          value: 'group' as const,
                          title: 'Everyone in this linked group',
                          description: 'Send one payment preference for all linked families.',
                        },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setPaymentScope(option.value)}
                          className={`rounded-lg border p-3 text-left transition ${
                            effectivePaymentScope === option.value
                              ? 'border-cyan-900 bg-white text-cyan-950 shadow-sm'
                              : 'border-cyan-200 bg-white/70 text-slate-700 hover:bg-white'
                          }`}
                        >
                          <p className="text-sm font-black">{option.title}</p>
                          <p className="mt-1 text-xs font-semibold leading-5">
                            {option.description}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-2 rounded-lg bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-slate-600">
                      {effectivePaymentScope === 'group' ? 'Linked group total' : 'Total package'}
                    </span>
                    <span className="text-lg font-black text-slate-950">
                      {formatMoney(paymentTargetTotal, resolved.combination.currency)}
                    </span>
                  </div>
                  {effectivePaymentScope === 'group' && (
                    <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-bold text-slate-600">
                          {currentLinkedFamily
                            ? getLinkedFamilyLabel(currentLinkedFamily, currentLinkedFamilyIndex)
                            : 'Current family'}
                        </span>
                        <span className="font-black text-slate-950">
                          {formatMoney(
                            resolved.combination.packageSubtotalPrice,
                            resolved.combination.currency,
                          )}
                        </span>
                      </div>
                      {linkedFamilyTotals.map(({ family, index, pricing }) => (
                        <div
                          key={`${family.quoteId || family.familyLabel}-${index}-payment-scope`}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span className="font-bold text-slate-600">
                            {getLinkedFamilyLabel(family, index)}
                          </span>
                          <span className="font-black text-slate-950">
                            {formatMoney(getPricingSubtotal(pricing), pricing.currency)}
                          </span>
                        </div>
                      ))}
                      {paymentProcessingFeeTotal > 0 && (
                        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 text-sm text-blue-700">
                          <span className="font-bold">Credit Card processing fee</span>
                          <span className="font-black">
                            +{formatMoney(
                              paymentProcessingFeeTotal,
                              resolved.combination.currency,
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {depositPaymentAvailable && (
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-600">Minimum deposit</span>
                      <span className="text-sm font-black text-slate-950">
                        {formatMoney(
                          activeDepositPaymentSummary?.depositAmount || 0,
                          payload.currency,
                        )}
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
                      value === 'deposit_only' && !depositPaymentAvailable
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
                      Split the selected payment amount. Any Credit Card processing fee is added
                      separately.
                    </p>
                    <div className="grid gap-2">
                      {PAYMENT_BREAKDOWN_FIELDS.map((field) => {
                        const value = activePaymentBreakdown?.[field.key] || ''
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
                                    ...(activePaymentBreakdown || {
                                      cash: 0,
                                      bankTransfer: 0,
                                      card: 0,
                                    }),
                                    [field.key]: Number(event.target.value || 0),
                                  }
                                  if (effectivePaymentScope === 'group') {
                                    setGroupPaymentBreakdown(nextBreakdown)
                                  } else {
                                    setSelection((current) =>
                                      current
                                        ? {
                                            ...current,
                                            paymentMethod: pickMethodFromBreakdown(nextBreakdown),
                                            paymentBreakdown: nextBreakdown,
                                          }
                                        : current,
                                    )
                                  }
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
                        activePaymentBreakdownBalanced
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {activePaymentBreakdownBalanced
                        ? 'Payment split matches the selected payment amount.'
                        : `Remaining to allocate: ${formatMoney(
                            activePaymentBreakdownRemaining,
                            resolved.combination.currency,
                          )}`}
                    </div>
                    {(activePaymentBreakdown?.cash || 0) > 0 ||
                    (activePaymentBreakdown?.bankTransfer || 0) > 0 ? (
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
                        activeDepositPaymentSummary &&
                        activeDepositPaymentSummary.processingFee > 0 ? (
                          <span className="text-blue-700">
                            Processing fee +
                            {formatMoney(
                              activeDepositPaymentSummary.processingFee,
                              payload.currency,
                            )} (
                            {payload.cardProcessingFeePercent}%)
                          </span>
                        ) : null}
                      </span>
                      <div className="flex min-h-10 items-center rounded-lg border border-amber-200 bg-white px-3">
                        <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                        <input
                          readOnly
                          value={(activeDepositPaymentSummary?.total || 0).toFixed(2)}
                          className="w-full bg-transparent text-sm font-bold outline-none"
                        />
                      </div>
                    </label>
                    {activeDepositPaymentSummary &&
                      activeDepositPaymentSummary.depositAmount > 0 && (
                      <p className="mt-2 text-xs font-bold text-amber-900">
                        Base deposit:{' '}
                        {formatMoney(activeDepositPaymentSummary.depositAmount, payload.currency)}
                        {activeDepositPaymentSummary.processingFee > 0
                          ? ` + ${formatMoney(
                              activeDepositPaymentSummary.processingFee,
                              payload.currency,
                            )} non-refundable Credit Card processing fee`
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
                    (paymentIntent === 'full_payment' && !activePaymentBreakdownBalanced)
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
              {packagePresets.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {packagePresets.map((preset) => {
                      const isActive = resolved?.combination.id === preset.resolved?.combination.id
                      return (
                        <button
                          key={preset.key}
                          type="button"
                          onClick={() =>
                            preset.resolved ? applyPackagePreset(preset.resolved.selection) : null
                          }
                          className={`min-h-10 rounded-lg px-3 text-xs font-black transition ${
                            isActive
                              ? 'bg-slate-950 text-white'
                              : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <span className="block">{preset.label}</span>
                          {preset.key !== 'luxury' && preset.resolved && (
                            <span
                              className={`mt-0.5 block text-[11px] ${
                                isActive ? 'text-white/80' : 'text-slate-500'
                              }`}
                            >
                              {formatMoney(
                                preset.resolved.combination.totalPrice,
                                preset.resolved.combination.currency,
                              )}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </section>
              )}
              {payload.flightOptions.length > 0 && (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <SectionTitle icon={Plane} title="Flights" />
                  <div className="space-y-3">
                    {payload.flightOptions.map((option) => {
                      const selectedFlight =
                        payload.flightOptions.find(
                          (candidate) => candidate.id === selection.flightOptionId,
                        ) || getPreferredOption(payload.flightOptions)
                      const selected = selection.flightOptionId === option.id
                      const deltas = getFlightOptionPriceDeltas(payload, option, selectedFlight)
                      return (
                        <OptionButton
                          key={option.id}
                          selected={selected}
                          title={option.title}
                          summary={formatTransportSummary(option)}
                          price={option.price}
                          priceLabel={selected ? 'Selected' : formatSelectionDelta(deltas.adult, payload.currency)}
                          priceSubLabel={selected ? 'current option' : undefined}
                          priceSubLines={
                            selected
                              ? undefined
                              : formatFlightPassengerDeltas(payload, option, selectedFlight)
                          }
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
                              const selected = selectedOption?.id === option.id
                              const deltas = getLinkedFlightOptionPriceDeltas(option, selectedOption)
                              return (
                                <OptionButton
                                  key={option.id}
                                  selected={selected}
                                  title={option.airlineName}
                                  summary={option.summary}
                                  price={deltas.adult}
                                  priceLabel={
                                    selected ? 'Selected' : formatSelectionDelta(deltas.adult, payload.currency)
                                  }
                                  priceSubLabel={selected ? 'current option' : undefined}
                                  priceSubLines={
                                    selected
                                      ? undefined
                                      : formatLinkedFlightPassengerDeltas(payload, option, selectedOption)
                                  }
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
                            {getVisaQuantity(option, payload)} x{' '}
                            {getVisaPassengerCategoryLabel(option.visaPassengerCategory)} included
                            {option.pricingMode === 'per_person' && (
                              <span className="block text-right text-[11px] font-bold text-slate-500">
                                {formatMoney(option.price, payload.currency)} pp
                              </span>
                            )}
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
                      const selectedTransport =
                        payload.transportOptions.find(
                          (candidate) => candidate.id === selection.transportOptionId,
                        ) || getPreferredOption(payload.transportOptions)
                      const selected = selection.transportOptionId === option.id
                      const delta = option.price - (selectedTransport?.price || 0)
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
                          selected={selected}
                          title={option.title}
                          summary={option.summary}
                          price={option.price}
                          priceLabel={
                            selected
                              ? 'Selected'
                              : formatSelectionDelta(perPassengerDelta, payload.currency)
                          }
                          priceSubLabel={selected ? 'current option' : undefined}
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
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <SectionTitle icon={Building2} title="Hotels" />
                  {canMatchLinkedHotelOptions && (
                    <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 sm:max-w-md">
                      <p className="text-xs font-black uppercase text-cyan-900">
                        Match linked group hotels?
                      </p>
                      <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">
                        Apply the same hotel option names to the other linked group where available.
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {[
                          { value: true, label: 'Yes, match hotels' },
                          { value: false, label: 'No, keep separate' },
                        ].map((option) => (
                          <button
                            key={option.label}
                            type="button"
                            onClick={() => setMatchLinkedHotelOptions(option.value)}
                            className={`min-h-9 rounded-lg px-3 text-xs font-black transition ${
                              matchLinkedHotelOptions === option.value
                                ? 'bg-cyan-900 text-white'
                                : 'border border-cyan-200 bg-white text-cyan-900 hover:bg-cyan-100'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  {orderedStayGroups.map((group) => (
                    <div key={group.id}>
                      <h3 className="mb-2 text-sm font-black text-slate-700">{group.label}</h3>
                      <div className="space-y-3">
                        {group.options.map((option) => {
                          const preferredHotel = getPreferredOption(group.options)
                          const payingGuests = payload.adults + payload.childrenPaying
                          const badges = [
                            preferredHotel?.id === option.id ? 'Agent recommended' : '',
                            (option.hotelAddonOptions || []).length > 0 ? 'Extras available' : '',
                          ].filter((badge): badge is string => Boolean(badge))
                          const selected = selection.stayOptionIds[group.id] === option.id
                          const selectedHotel =
                            group.options.find(
                              (candidate) => candidate.id === selection.stayOptionIds[group.id],
                            ) || preferredHotel
                          const selectedDelta = option.price - (selectedHotel?.price || 0)
                          const selectedPerPersonDelta =
                            payingGuests > 0 ? selectedDelta / payingGuests : selectedDelta
                          const addonOptions = option.hotelAddonOptions || []
                          const selectedAddonIds = selection.hotelAddonOptionIds?.[group.id] || []
                          return (
                            <div key={option.id} className="space-y-2">
                              <OptionButton
                                selected={selected}
                                title={option.title}
                                summary={option.summary}
                                price={option.price}
                                priceLabel={
                                  selected
                                    ? 'Selected'
                                    : formatSelectionDelta(selectedPerPersonDelta, payload.currency)
                                }
                                priceSubLabel={selected ? 'current option' : 'hotel option'}
                                pricingMode={option.pricingMode}
                                badges={badges}
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
                                          hotelAddonOptionIds: {
                                            ...(current.hotelAddonOptionIds || {}),
                                            [group.id]:
                                              current.stayOptionIds[group.id] === option.id
                                                ? current.hotelAddonOptionIds?.[group.id] || []
                                                : [],
                                          },
                                        }
                                      : current,
                                  )
                                }
                              />
                              {selected && addonOptions.length > 0 && (
                                <div className="ml-4 rounded-xl border border-violet-100 bg-violet-50 p-3">
                                  <p className="text-xs font-black uppercase text-violet-900">
                                    Optional hotel extras
                                  </p>
                                  <div className="mt-2 grid gap-2">
                                    {addonOptions.map((addon) => {
                                      const addonSelected = selectedAddonIds.includes(addon.id)
                                      return (
                                        <button
                                          key={addon.id}
                                          type="button"
                                          onClick={() =>
                                            setSelection((current) => {
                                              if (!current) return current
                                              const currentIds =
                                                current.hotelAddonOptionIds?.[group.id] || []
                                              const nextIds = addonSelected
                                                ? currentIds.filter((id) => id !== addon.id)
                                                : [...currentIds, addon.id]
                                              return {
                                                ...current,
                                                hotelAddonOptionIds: {
                                                  ...(current.hotelAddonOptionIds || {}),
                                                  [group.id]: nextIds,
                                                },
                                              }
                                            })
                                          }
                                          className={`flex min-h-11 items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm transition ${
                                            addonSelected
                                              ? 'border-violet-300 bg-white text-violet-950 shadow-sm'
                                              : 'border-violet-100 bg-white/70 text-slate-700 hover:bg-white'
                                          }`}
                                        >
                                          <span className="font-black">
                                            {addon.label || 'Hotel extra'}
                                          </span>
                                          <span className="flex shrink-0 items-center gap-2">
                                            {addonSelected && (
                                              <span className="rounded-full bg-violet-900 px-2 py-1 text-[11px] font-black uppercase text-white">
                                                Selected
                                              </span>
                                            )}
                                            <span className="font-black">
                                              {formatSignedHotelExtraPrice(
                                                addon.price,
                                                payload.currency,
                                              )}
                                            </span>
                                          </span>
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
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
                      {linkedFamilyTotals.map(({ family, index, pricing }) => (
                        <div
                          key={`${family.quoteId || family.familyLabel}-${index}-summary`}
                          className="border-t border-slate-200 pt-2"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-bold text-slate-600">
                              {getLinkedFamilyLabel(family, index)} total
                            </span>
                            <span className="font-black text-slate-950">
                              {formatMoney(pricing.totalPrice, pricing.currency)}
                            </span>
                          </div>
                          {pricing.discountTotal > 0 && (
                            <div className="mt-1 flex items-center justify-between gap-3 text-xs text-emerald-700">
                              <span className="font-bold">Discount applied</span>
                              <span className="font-black">
                                -{formatMoney(pricing.discountTotal, pricing.currency)}
                              </span>
                            </div>
                          )}
                        </div>
                      ))}
                      {superGroupTotals && linkedFamilyTotals.length > 0 && (
                        <div className="rounded-lg border border-[#8b1e2d]/30 bg-white p-3 shadow-sm">
                          <p className="text-xs font-black uppercase text-[#8b1e2d]">Super total</p>
                          <div className="mt-2 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <span className="font-bold text-slate-600">
                                Before group discounts
                              </span>
                              <span className="font-black text-slate-950">
                                {formatMoney(
                                  superGroupTotals.grossPrice,
                                  superGroupTotals.currency,
                                )}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3 text-emerald-700">
                              <span className="font-bold">Group discounts applied</span>
                              <span className="font-black">
                                {superGroupTotals.discountTotal > 0
                                  ? `-${formatMoney(
                                      superGroupTotals.discountTotal,
                                      superGroupTotals.currency,
                                    )}`
                                  : 'None'}
                              </span>
                            </div>
                            <div className="border-t border-slate-200 pt-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-black text-slate-950">
                                  After group discounts
                                </span>
                                <span className="font-black text-slate-950">
                                  {formatMoney(
                                    superGroupTotals.totalPrice,
                                    superGroupTotals.currency,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
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
                      <div className="mt-4 border-t-4 border-[#8b1e2d] pt-4">
                        <p className="text-xs font-black uppercase text-[#8b1e2d]">
                          Additional details
                        </p>
                        <p className="mt-3 text-xs font-black uppercase text-slate-500">
                          Passenger prices
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-600">
                          Adult, child, and infant prices are listed below.
                        </p>

                        {priceBreakdown && (
                          <div className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm">
                            <p className="text-xs font-black uppercase text-slate-500">
                              {currentLinkedFamily
                                ? `${getLinkedFamilyLabel(
                                    currentLinkedFamily,
                                    currentLinkedFamilyIndex,
                                  )} passenger pricing`
                                : 'Passenger pricing'}
                            </p>
                            <PassengerPricingRows
                              breakdown={priceBreakdown}
                              currency={priceBreakdown.currency}
                            />
                          </div>
                        )}
                        {linkedFamilyTotals.map(({ family, index, pricing }) => (
                          <div
                            key={`${family.quoteId || family.familyLabel}-${index}-breakdown`}
                            className="mt-3 space-y-2 rounded-lg bg-slate-50 p-3 text-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-xs font-black uppercase text-slate-500">
                                  {getLinkedFamilyLabel(family, index)} passenger pricing
                                </p>
                                {family.quoteTitle && (
                                  <p className="mt-1 text-xs font-semibold text-slate-500">
                                    {family.quoteTitle}
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-sm font-black text-slate-950">
                                {formatMoney(pricing.totalPrice, pricing.currency)}
                              </span>
                            </div>
                            <PassengerPricingRows
                              breakdown={pricing.breakdown}
                              currency={pricing.currency}
                            />
                          </div>
                        ))}
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
                      </div>
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
