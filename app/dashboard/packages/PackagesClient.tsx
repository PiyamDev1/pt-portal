'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft,
  Building2,
  Bus,
  Calculator,
  ChevronDown,
  Clock3,
  Copy,
  CopyPlus,
  CreditCard,
  ExternalLink,
  FileText,
  Link2,
  PackageCheck,
  Pencil,
  Plane,
  Plus,
  RefreshCw,
  Save,
  Send,
  Tag,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  PackageComponentOption,
  PackageLinkedFlightGroup,
  PackageLinkedFlightOption,
  PackageLimitedTimeOffer,
  PackageQuotePayload,
  PackageStayGroup,
  PackageTransportRouteKind,
  PackageTransportRouteSelection,
  TravelPackageQuote,
  TravelPackageType,
} from '@/app/types/packages'
import type { TravelPackageGroup } from '@/app/types/packages'
import {
  buildCustomerPackageOptions,
  DEFAULT_CARD_PROCESSING_FEE_PERCENT,
  formatPackageQuoteForCopy,
  formatMoney,
  getDefaultPackageExpiry,
  getOrderedStaySelections,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
} from '@/lib/packageQuote'
import { buildLinkedPackageGroupSnapshot, type TravelPackageGroupDetail } from '@/lib/packageGroups'

type PackagesClientProps = {
  currentUserId: string
  initialQuoteId?: string | null
}

type PackagesResponse = {
  packages: TravelPackageQuote[]
  setupRequired?: boolean
  message?: string
}

type SaveResponse = {
  quote: TravelPackageQuote | null
  setupRequired?: boolean
  message?: string
  error?: string
}

type PackageGroupsResponse = {
  groups: TravelPackageGroup[]
  setupRequired?: boolean
  message?: string
  error?: string
}

type PackageGroupResponse = {
  group: TravelPackageGroupDetail | TravelPackageGroup | null
  setupRequired?: boolean
  message?: string
  error?: string
}

type UmrahTransportPricingRoute = {
  id: string
  route_name: string
}

type UmrahTransportPricingSupplier = {
  id: string
  name: string
  default_currency: string
}

type UmrahTransportPricingVehicle = {
  id: string
  label: string
  passenger_capacity: string | null
}

type UmrahTransportPricingRate = {
  route_id: string
  supplier_id: string
  vehicle_type_id: string
  currency: string
  cost_price: number
}

type UmrahTransportPricingLabel = {
  supplier_id: string
  vehicle_type_id: string
  transport_label: string | null
}

type UmrahTransportPricingData = {
  routes: UmrahTransportPricingRoute[]
  suppliers: UmrahTransportPricingSupplier[]
  vehicles: UmrahTransportPricingVehicle[]
  rates: UmrahTransportPricingRate[]
  labels: UmrahTransportPricingLabel[]
  sarToGbpExchangeRate: number
  damageRecoveryMarginMode: 'percent' | 'fixed'
  damageRecoveryMarginValue: number
  setupRequired?: boolean
  message?: string
}

const PACKAGE_TYPES: Array<{ value: TravelPackageType; label: string }> = [
  { value: 'umrah', label: 'Umrah' },
  { value: 'ziyarat', label: 'Ziyarat' },
  { value: 'holiday', label: 'Holiday' },
]

type QuoteFilter = 'all' | 'live' | 'draft' | 'selected' | 'expired'

const QUOTE_FILTERS: Array<{ value: QuoteFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live Links' },
  { value: 'draft', label: 'Drafts' },
  { value: 'selected', label: 'Selected' },
  { value: 'expired', label: 'Expired' },
]

function makeId(prefix: string) {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function getRouteKind(routeName: string): PackageTransportRouteKind {
  const normalized = normalizeSearchText(routeName)
  if (normalized.includes('makkah') && normalized.includes('ziyarat')) return 'makkah_ziyarat'
  if (
    (normalized.includes('madinah') || normalized.includes('madina')) &&
    normalized.includes('ziyarat')
  ) {
    return 'madinah_ziyarat'
  }
  return 'transfer'
}

function isRouteKind(route: UmrahTransportPricingRoute, kind: PackageTransportRouteKind) {
  return getRouteKind(route.route_name) === kind
}

function getSupplierVehicleLabel(
  pricing: UmrahTransportPricingData | null,
  supplierId: string,
  vehicleTypeId: string,
) {
  if (!pricing) return ''
  const supplierLabel = pricing.labels.find(
    (label) => label.supplier_id === supplierId && label.vehicle_type_id === vehicleTypeId,
  )?.transport_label
  return (
    supplierLabel ||
    pricing.vehicles.find((vehicle) => vehicle.id === vehicleTypeId)?.label ||
    'Transport'
  )
}

function getTransportRate(
  pricing: UmrahTransportPricingData | null,
  routeId: string,
  supplierId: string,
  vehicleTypeId: string,
) {
  return pricing?.rates.find(
    (rate) =>
      rate.route_id === routeId &&
      rate.supplier_id === supplierId &&
      rate.vehicle_type_id === vehicleTypeId,
  )
}

function convertTransportCostToGbp(
  amount: number,
  currency: string,
  pricing: UmrahTransportPricingData | null,
) {
  if (currency === 'GBP') return amount
  if (currency === 'SAR') {
    const exchangeRate = pricing?.sarToGbpExchangeRate || 0
    return exchangeRate > 0 ? amount / exchangeRate : amount
  }
  return amount
}

function getTransportExchangeRateSnapshot(
  currency: string,
  pricing: UmrahTransportPricingData | null,
) {
  if (currency === 'SAR') return pricing?.sarToGbpExchangeRate || 0
  if (currency === 'GBP') return 1
  return 0
}

function getDamageRecoveryMargin(baseCostGbp: number, pricing: UmrahTransportPricingData | null) {
  const mode: 'percent' | 'fixed' =
    pricing?.damageRecoveryMarginMode === 'percent' ? 'percent' : 'fixed'
  const value = Number(pricing?.damageRecoveryMarginValue || 0)
  const margin = mode === 'percent' ? baseCostGbp * (value / 100) : value
  return {
    mode,
    value,
    amountGbp: Math.max(0, Math.round(margin * 100) / 100),
  }
}

function buildTransportRouteCostSnapshot({
  routeId,
  supplierId,
  vehicleTypeId,
  pricing,
}: {
  routeId: string
  supplierId: string
  vehicleTypeId: string
  pricing: UmrahTransportPricingData | null
}) {
  const rate = getTransportRate(pricing, routeId, supplierId, vehicleTypeId)
  const supplier = pricing?.suppliers.find((item) => item.id === supplierId)
  if (!rate || !supplier) return null

  const costPrice = Number(rate.cost_price || 0)
  const currency = rate.currency || supplier.default_currency || 'GBP'
  const exchangeRate = getTransportExchangeRateSnapshot(currency, pricing)
  const baseCostPriceGbp = convertTransportCostToGbp(costPrice, currency, pricing)
  const margin = getDamageRecoveryMargin(baseCostPriceGbp, pricing)
  const costPriceGbp = baseCostPriceGbp + margin.amountGbp

  return {
    supplier,
    costPrice,
    currency,
    baseCostPriceGbp: Math.round(baseCostPriceGbp * 100) / 100,
    costPriceGbp: Math.round(costPriceGbp * 100) / 100,
    exchangeRate,
    margin,
  }
}

function findCheapestTransportRate(
  pricing: UmrahTransportPricingData | null,
  routeId: string,
  vehicleTypeId: string,
) {
  if (!pricing) return null
  return pricing.rates
    .filter(
      (rate) =>
        rate.route_id === routeId &&
        rate.vehicle_type_id === vehicleTypeId &&
        Number(rate.cost_price) > 0,
    )
    .sort((a, b) => {
      const aGbp = convertTransportCostToGbp(Number(a.cost_price), a.currency, pricing)
      const bGbp = convertTransportCostToGbp(Number(b.cost_price), b.currency, pricing)
      return aGbp - bGbp
    })[0]
}

function hasTransportRateForVehicle(
  pricing: UmrahTransportPricingData | null,
  routeId: string,
  vehicleTypeId: string,
) {
  return Boolean(findCheapestTransportRate(pricing, routeId, vehicleTypeId))
}

function getPricedRouteOptions(
  pricing: UmrahTransportPricingData | null,
  vehicleTypeId: string,
  kind?: PackageTransportRouteKind,
) {
  if (!pricing || !vehicleTypeId) return []
  return pricing.routes.filter((route) => {
    if (kind && !isRouteKind(route, kind)) return false
    return hasTransportRateForVehicle(pricing, route.id, vehicleTypeId)
  })
}

function getRouteCategory(routeName: string) {
  const normalized = normalizeSearchText(routeName)
  if (normalized.startsWith('jeddah') || normalized.includes(' jeddah ')) return 'Jeddah'
  if (normalized.startsWith('makkah') || normalized.includes(' makkah ')) return 'Makkah'
  if (
    normalized.startsWith('madinah') ||
    normalized.startsWith('madina') ||
    normalized.includes(' madinah ') ||
    normalized.includes(' madina ')
  ) {
    return 'Madinah'
  }
  return 'Other routes'
}

function getGroupedRouteOptions(routes: UmrahTransportPricingRoute[]) {
  const categoryOrder = ['Jeddah', 'Makkah', 'Madinah', 'Other routes']
  const grouped = new Map<string, UmrahTransportPricingRoute[]>()
  routes.forEach((route) => {
    const category = getRouteCategory(route.route_name)
    grouped.set(category, [...(grouped.get(category) || []), route])
  })
  return categoryOrder
    .map((category) => ({
      category,
      routes: grouped.get(category) || [],
    }))
    .filter((group) => group.routes.length > 0)
}

function findDefaultTransportSelection(
  pricing: UmrahTransportPricingData | null,
  kind: PackageTransportRouteKind,
) {
  if (!pricing) return null
  for (const vehicle of pricing.vehicles) {
    const route = getPricedRouteOptions(pricing, vehicle.id, kind)[0]
    if (route) return { route, vehicle }
  }
  return null
}

function getMajoritySupplier(routes: PackageTransportRouteSelection[]) {
  const counts = new Map<string, { supplierId: string; supplierName: string; count: number }>()
  routes.forEach((route) => {
    if (!route.supplierId) return
    const current = counts.get(route.supplierId)
    counts.set(route.supplierId, {
      supplierId: route.supplierId,
      supplierName: route.supplierName,
      count: (current?.count || 0) + 1,
    })
  })
  return Array.from(counts.values()).sort((a, b) => b.count - a.count)[0] || null
}

function getTransportRouteBullets(routes: PackageTransportRouteSelection[]) {
  return routes.map((route) => `* ${route.routeName}`)
}

function getTransportRouteBulletText(line: string) {
  return line.match(/^\*\s+(.+)$/)?.[1] || line
}

function buildTransportSummary(routes: PackageTransportRouteSelection[], fallback: string) {
  if (routes.length === 0) return fallback
  return getTransportRouteBullets(routes).join('\n')
}

function restoreTransportRoutesFromSummary(
  summary: string,
  pricing: UmrahTransportPricingData | null,
) {
  if (!pricing) return []
  const routeLookup = new Map(
    pricing.routes.map((route) => [normalizeSearchText(route.route_name), route]),
  )

  return summary
    .split('\n')
    .map((line) => line.match(/^\*\s+(.+)$/)?.[1]?.trim() || '')
    .filter(Boolean)
    .map((routeName) => {
      const route =
        routeLookup.get(normalizeSearchText(routeName)) ||
        pricing.routes.find(
          (item) =>
            normalizeSearchText(item.route_name).includes(normalizeSearchText(routeName)) ||
            normalizeSearchText(routeName).includes(normalizeSearchText(item.route_name)),
        )
      if (!route) return null

      const vehicle =
        pricing.vehicles.find((item) => hasTransportRateForVehicle(pricing, route.id, item.id)) ||
        pricing.vehicles[0]
      if (!vehicle) return null

      return resolveTransportRouteSelection(
        {
          id: makeId('transport-route'),
          kind: getRouteKind(route.route_name),
          routeId: route.id,
          vehicleTypeId: vehicle.id,
        },
        pricing,
      )
    })
    .filter((route): route is PackageTransportRouteSelection => Boolean(route))
}

function resolveTransportRouteSelection(
  current: Partial<PackageTransportRouteSelection>,
  pricing: UmrahTransportPricingData | null,
): PackageTransportRouteSelection {
  const vehicle =
    pricing?.vehicles.find((item) => item.id === current.vehicleTypeId) || pricing?.vehicles[0]
  const pricedRoutes = vehicle ? getPricedRouteOptions(pricing, vehicle.id, current.kind) : []
  const route = pricedRoutes.find((item) => item.id === current.routeId) || pricedRoutes[0]
  const cheapestRate =
    route && vehicle ? findCheapestTransportRate(pricing, route.id, vehicle.id) : null
  const supplier = pricing?.suppliers.find((item) => item.id === cheapestRate?.supplier_id)
  const costSnapshot =
    route && supplier && vehicle
      ? buildTransportRouteCostSnapshot({
          routeId: route.id,
          supplierId: supplier.id,
          vehicleTypeId: vehicle.id,
          pricing,
        })
      : null

  return {
    id: current.id || makeId('transport-route'),
    kind: current.kind || getRouteKind(route?.route_name || ''),
    routeId: route?.id || '',
    routeName: route?.route_name || current.routeName || 'Transport route',
    supplierId: supplier?.id || '',
    supplierName: supplier?.name || '',
    vehicleTypeId: vehicle?.id || '',
    vehicleLabel:
      supplier && vehicle ? getSupplierVehicleLabel(pricing, supplier.id, vehicle.id) : '',
    costPrice: costSnapshot?.costPrice || 0,
    currency: costSnapshot?.currency || supplier?.default_currency || 'GBP',
    baseCostPriceGbp: costSnapshot?.baseCostPriceGbp || 0,
    costPriceGbp: costSnapshot?.costPriceGbp || 0,
    exchangeRate: costSnapshot?.exchangeRate || 0,
    exchangeRateMode: 'sar_per_gbp',
    damageRecoveryMarginMode: costSnapshot?.margin.mode || 'fixed',
    damageRecoveryMarginValue: costSnapshot?.margin.value || 0,
    damageRecoveryMarginAmountGbp: costSnapshot?.margin.amountGbp || 0,
  }
}

function getTransportRouteNetCostForSupplier(
  route: PackageTransportRouteSelection,
  supplierId: string | undefined,
  pricing: UmrahTransportPricingData | null,
) {
  if (!supplierId) return route.costPriceGbp || 0
  const supplierCost = buildTransportRouteCostSnapshot({
    routeId: route.routeId,
    supplierId,
    vehicleTypeId: route.vehicleTypeId,
    pricing,
  })
  return supplierCost?.costPriceGbp ?? route.costPriceGbp ?? 0
}

function newOption(
  prefix: string,
  overrides: Partial<PackageComponentOption> = {},
): PackageComponentOption {
  const pricingMode = prefix === 'flight' || prefix === 'visa' ? 'per_person' : 'total'

  return {
    id: makeId(prefix),
    title: '',
    summary: '',
    price: 0,
    pricingMode,
    isDefault: false,
    adultPrice: 0,
    childPrice: 0,
    infantPrice: 0,
    ...overrides,
  }
}

function newLinkedFlightOption(overrides: Partial<PackageLinkedFlightOption> = {}) {
  return {
    id: makeId('linked-flight-option'),
    airlineName: '',
    summary: '',
    adultDelta: 0,
    childDelta: 0,
    infantDelta: 0,
    isDefault: false,
    ...overrides,
  }
}

function newLinkedFlightGroup(baseFlightOptionId: string): PackageLinkedFlightGroup {
  const included = newLinkedFlightOption({
    airlineName: 'Included airline',
    isDefault: true,
  })
  return {
    id: makeId('linked-flight'),
    baseFlightOptionId,
    routeLabel: '',
    defaultOptionId: included.id,
    options: [included, newLinkedFlightOption({ airlineName: 'Alternative airline' })],
  }
}

function newLimitedTimeOffer(): PackageLimitedTimeOffer {
  return {
    id: makeId('offer'),
    title: 'Early bird offer',
    summary: 'Book and purchase this package by the deadline and get a discount.',
    expiresAt: '',
    discountAmount: 0,
    discountMode: 'total',
    active: true,
  }
}

function makeQuoteShortRef() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const values = crypto.getRandomValues(new Uint8Array(6))
    return Array.from(values, (value) => characters[value % characters.length]).join('')
  }
  return Array.from(
    { length: 6 },
    () => characters[Math.floor(Math.random() * characters.length)],
  ).join('')
}

function formatQuoteNameDate(value: Date) {
  return value.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatQuoteTypeName(type: TravelPackageType) {
  const match = PACKAGE_TYPES.find((candidate) => candidate.value === type)
  return match?.label || 'Package'
}

function createDefaultStaySetup(packageType: TravelPackageType) {
  if (packageType === 'holiday') {
    const stayGroups = [1, 2, 3].map((position) => {
      const id = `location-${position}`
      return {
        id,
        label: `Location ${position}`,
        options: [newOption(`${id}-hotel`, { isDefault: true })],
      }
    })
    return {
      itineraryOrder: stayGroups.map((group) => group.id),
      stayGroups,
    }
  }

  const stayGroups = [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [newOption('makkah-hotel', { isDefault: true })],
    },
    {
      id: 'madinah',
      label: 'Madinah',
      options: [newOption('madinah-hotel', { isDefault: true })],
    },
  ]

  return {
    itineraryOrder: stayGroups.map((group) => group.id),
    stayGroups,
  }
}

function getQuoteTitleRef(title: string) {
  return (
    title.match(/^([A-Z0-9]{6})\s+-\s+/i)?.[1]?.toUpperCase() ||
    title.match(/\b([A-Z0-9]{6})$/i)?.[1]?.toUpperCase() ||
    ''
  )
}

function getQuoteTitleDate(title: string) {
  return (
    title.match(/^[A-Z0-9]{6}\s+-\s+.+?\s+Quotation\s+(.+)$/i)?.[1] ||
    title.match(/Quotation\s+(.+?)\s+-\s+[A-Z0-9]{6}$/i)?.[1] ||
    ''
  )
}

function buildSystematicQuoteTitle(payload: PackageQuotePayload, ref?: string) {
  const quoteRef = (ref || getQuoteTitleRef(payload.title) || makeQuoteShortRef()).toUpperCase()
  const quoteDate = getQuoteTitleDate(payload.title) || formatQuoteNameDate(new Date())
  return `${quoteRef} - ${formatQuoteTypeName(payload.packageType)} Quotation ${quoteDate}`
}

function withSystematicQuoteTitle(payload: PackageQuotePayload, ref?: string) {
  return normalizePackageQuotePayload({
    ...payload,
    title: buildSystematicQuoteTitle(payload, ref),
  })
}

function createInitialPayload(): PackageQuotePayload {
  const defaultStaySetup = createDefaultStaySetup('umrah')

  return withSystematicQuoteTitle({
    title: '',
    packageType: 'umrah',
    currency: 'GBP',
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    adults: 2,
    childrenPaying: 0,
    childrenFree: 0,
    infants: 0,
    itineraryOrder: defaultStaySetup.itineraryOrder,
    departureDate: '',
    returnDate: '',
    stayGroups: defaultStaySetup.stayGroups,
    flightOptions: [newOption('flight', { isDefault: true })],
    linkedFlightGroups: [],
    visaOptions: [newOption('visa')],
    transportOptions: [newOption('transport', { isDefault: true })],
    limitedTimeOffers: [],
    cardProcessingFeePercent: DEFAULT_CARD_PROCESSING_FEE_PERCENT,
    depositRequired: false,
    depositAmount: 0,
    notes: '',
  })
}

function buildShareUrl(token?: string) {
  if (!token || typeof window === 'undefined') return ''
  return `${window.location.origin}/packages/${token}`
}

function getQuoteStartingPrice(quote: TravelPackageQuote) {
  return buildCustomerPackageOptions(quote.payload, 1)[0]?.combination || null
}

function toDateTimeLocalValue(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return localDate.toISOString().slice(0, 16)
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return getDefaultPackageExpiry()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return getDefaultPackageExpiry()
  return date.toISOString()
}

function formatExpiry(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Invalid expiry'
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function SectionHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: typeof Building2
  title: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Icon className="h-4 w-4" />
        </span>
        <h2 className="text-base font-black text-slate-950">{title}</h2>
      </div>
      {action}
    </div>
  )
}

function LinkedFlightGroupEditor({
  group,
  onChange,
  onRemove,
}: {
  group: PackageLinkedFlightGroup
  onChange: (next: PackageLinkedFlightGroup) => void
  onRemove: () => void
}) {
  const updateOption = (optionIndex: number, option: PackageLinkedFlightOption) => {
    const nextOptions = group.options.map((current, index) =>
      index === optionIndex ? option : current,
    )
    onChange({
      ...group,
      defaultOptionId: option.isDefault ? option.id : group.defaultOptionId,
      options: option.isDefault
        ? nextOptions.map((current) => ({ ...current, isDefault: current.id === option.id }))
        : nextOptions,
    })
  }

  const addOption = () => {
    onChange({
      ...group,
      options: [...group.options, newLinkedFlightOption({ airlineName: 'Alternative airline' })],
    })
  }

  const removeOption = (optionId: string) => {
    const nextOptions = group.options.filter((option) => option.id !== optionId)
    const fallbackDefault = nextOptions.find((option) => option.isDefault) || nextOptions[0]
    onChange({
      ...group,
      defaultOptionId: fallbackDefault?.id || null,
      options: nextOptions.map((option) => ({
        ...option,
        isDefault: option.id === fallbackDefault?.id,
      })),
    })
  }

  return (
    <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <label className="block flex-1">
          <span className="block text-xs font-black uppercase text-blue-900">
            Linked flight leg
          </span>
          <input
            value={group.routeLabel}
            onChange={(event) => onChange({ ...group, routeLabel: event.target.value })}
            placeholder="Madinah to London"
            className="mt-1 min-h-10 w-full rounded-lg border border-blue-100 bg-white px-3 text-sm font-bold outline-none focus:border-blue-700"
          />
        </label>
        <button
          type="button"
          onClick={onRemove}
          className="mt-5 flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
          title="Remove linked flight"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3">
        {group.options.map((option, optionIndex) => (
          <div key={option.id} className="rounded-lg border border-blue-100 bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                value={option.airlineName}
                onChange={(event) =>
                  updateOption(optionIndex, { ...option, airlineName: event.target.value })
                }
                placeholder="Airline"
                className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-700"
              />
              <button
                type="button"
                onClick={() =>
                  updateOption(optionIndex, {
                    ...option,
                    isDefault: true,
                  })
                }
                className={`min-h-10 rounded-lg px-3 text-xs font-black transition ${
                  option.isDefault
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {option.isDefault ? 'Included' : 'Mark included'}
              </button>
              <button
                type="button"
                onClick={() => removeOption(option.id)}
                disabled={group.options.length <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
                title="Remove airline"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={option.summary}
              onChange={(event) =>
                updateOption(optionIndex, { ...option, summary: event.target.value })
              }
              placeholder="Connection, baggage, airport notes"
              rows={2}
              className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-700"
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {[
                ['Adult leg cost', 'adultPrice'],
                ['Child leg cost', 'childPrice'],
                ['Infant leg cost', 'infantPrice'],
              ].map(([label, key]) => (
                <label key={key} className="block">
                  <span className="block text-xs font-bold text-slate-500">{label}</span>
                  <div className="mt-1 flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
                    <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                    <input
                      value={option[key as 'adultPrice' | 'childPrice' | 'infantPrice'] ?? ''}
                      onChange={(event) =>
                        updateOption(optionIndex, {
                          ...option,
                          [key]: Number(event.target.value || 0),
                        })
                      }
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="w-full bg-transparent text-sm font-bold outline-none"
                    />
                  </div>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs font-semibold text-blue-900">
              Enter the actual cost for this leg. Customers see only the difference from the
              included airline for this leg.
            </p>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addOption}
        className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-xs font-black text-blue-900 transition hover:bg-blue-100"
      >
        <Plus className="h-4 w-4" />
        Add airline for this leg
      </button>
    </div>
  )
}

function OptionEditor({
  option,
  onChange,
  onRemove,
  titlePlaceholder,
  summaryPlaceholder,
  priceLabel = 'Total price',
  showPricingMode = false,
  showFlightPricing = false,
  showHotelCostAudit = false,
  showDefaultToggle = false,
  defaultLabel = 'Preferred option',
  showQuantity = false,
  showTransportExtras = false,
  showTransportPriceList = true,
  transportPricingData = null,
  quantityFallback,
  canRemove,
}: {
  option: PackageComponentOption
  onChange: (next: PackageComponentOption) => void
  onRemove: () => void
  titlePlaceholder: string
  summaryPlaceholder: string
  priceLabel?: string
  showPricingMode?: boolean
  showFlightPricing?: boolean
  showHotelCostAudit?: boolean
  showDefaultToggle?: boolean
  defaultLabel?: string
  showQuantity?: boolean
  showTransportExtras?: boolean
  showTransportPriceList?: boolean
  transportPricingData?: UmrahTransportPricingData | null
  quantityFallback?: number
  canRemove: boolean
}) {
  const restoredTransportSummaryRef = useRef('')
  const transportRoutes = option.transportRoutes || []
  const canUseTransportPriceList = showTransportExtras && showTransportPriceList
  const hasSavedTransportRates = Boolean(transportPricingData?.rates.length)
  const transferAvailable = Boolean(findDefaultTransportSelection(transportPricingData, 'transfer'))
  const makkahZiyaratAvailable = Boolean(
    findDefaultTransportSelection(transportPricingData, 'makkah_ziyarat'),
  )
  const madinahZiyaratAvailable = Boolean(
    findDefaultTransportSelection(transportPricingData, 'madinah_ziyarat'),
  )

  const updateTransportRoutes = useCallback(
    (routes: PackageTransportRouteSelection[], summaryOverride?: string) => {
      const mainSupplier = getMajoritySupplier(routes)
      const netCost = routes.reduce((total, route) => {
        return (
          total +
          getTransportRouteNetCostForSupplier(route, mainSupplier?.supplierId, transportPricingData)
        )
      }, 0)
      const summary = summaryOverride ?? buildTransportSummary(routes, option.summary)

      onChange({
        ...option,
        title: option.title || (mainSupplier ? `${mainSupplier.supplierName} transport` : ''),
        summary,
        transportRoutes: routes,
        transportMainSupplierId: mainSupplier?.supplierId || '',
        transportMainSupplierName: mainSupplier?.supplierName || '',
        transportNetCost: Math.round(netCost * 100) / 100,
        transportNetCurrency: 'GBP',
        includesZiyarat:
          routes.some((route) => route.kind !== 'transfer') || option.includesZiyarat,
      })
    },
    [onChange, option, transportPricingData],
  )

  useEffect(() => {
    if (!canUseTransportPriceList || !transportPricingData || transportRoutes.length > 0) return
    const summaryKey = option.summary.trim()
    if (!summaryKey || restoredTransportSummaryRef.current === summaryKey) return

    const restoredRoutes = restoreTransportRoutesFromSummary(summaryKey, transportPricingData)
    if (restoredRoutes.length === 0) return

    restoredTransportSummaryRef.current = summaryKey
    updateTransportRoutes(restoredRoutes, option.summary)
  }, [
    option.summary,
    canUseTransportPriceList,
    transportPricingData,
    transportRoutes.length,
    updateTransportRoutes,
  ])

  const addTransportRoute = (kind: PackageTransportRouteKind) => {
    const selection = findDefaultTransportSelection(transportPricingData, kind)
    if (!selection) {
      toast.error('No matching Umrah transport route is configured yet')
      return
    }
    updateTransportRoutes([
      ...transportRoutes,
      resolveTransportRouteSelection(
        {
          id: makeId('transport-route'),
          kind,
          routeId: selection.route.id,
          vehicleTypeId: selection.vehicle.id,
        },
        transportPricingData,
      ),
    ])
  }

  const updateTransportRoute = (
    routeIndex: number,
    changes: Partial<PackageTransportRouteSelection>,
  ) => {
    updateTransportRoutes(
      transportRoutes.map((route, index) =>
        index === routeIndex
          ? resolveTransportRouteSelection({ ...route, ...changes }, transportPricingData)
          : route,
      ),
    )
  }

  const removeTransportRoute = (routeIndex: number) => {
    updateTransportRoutes(transportRoutes.filter((_, index) => index !== routeIndex))
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={option.title}
          onChange={(event) => onChange({ ...option, title: event.target.value })}
          placeholder={titlePlaceholder}
          className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
        />
        <button
          type="button"
          onClick={onRemove}
          disabled={!canRemove}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
          title="Remove option"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {showDefaultToggle && (
        <button
          type="button"
          onClick={() => onChange({ ...option, isDefault: true })}
          className={`mb-2 min-h-9 rounded-lg px-3 text-xs font-black transition ${
            option.isDefault
              ? 'bg-emerald-100 text-emerald-800'
              : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
          }`}
        >
          {option.isDefault ? defaultLabel : 'Mark preferred'}
        </button>
      )}
      {showTransportExtras && (
        <div className="mb-2 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ['includesZiyarat', 'Ziyarat included'],
              ['includesTourGuide', 'Tour guide included'],
            ].map(([key, label]) => {
              const active = Boolean(option[key as 'includesZiyarat' | 'includesTourGuide'])
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    onChange({
                      ...option,
                      [key]: !active,
                    })
                  }
                  className={`min-h-9 rounded-lg px-3 text-xs font-black transition ${
                    active
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {canUseTransportPriceList && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase text-slate-500">
                    Routes from price list
                  </p>
                  <p className="text-xs font-semibold text-slate-500">
                    Cheapest supplier is selected when route or vehicle changes.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => addTransportRoute('transfer')}
                    disabled={!transportPricingData || !transferAvailable}
                    className="min-h-8 rounded-lg bg-slate-900 px-2 text-xs font-black text-white disabled:opacity-40"
                  >
                    Add route
                  </button>
                  <button
                    type="button"
                    onClick={() => addTransportRoute('makkah_ziyarat')}
                    disabled={!makkahZiyaratAvailable}
                    className="min-h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 disabled:opacity-40"
                  >
                    Makkah Ziyarat
                  </button>
                  <button
                    type="button"
                    onClick={() => addTransportRoute('madinah_ziyarat')}
                    disabled={!madinahZiyaratAvailable}
                    className="min-h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 disabled:opacity-40"
                  >
                    Madinah Ziyarat
                  </button>
                </div>
              </div>

              {transportRoutes.length > 0 && (
                <ul className="mb-3 space-y-1 text-xs font-semibold text-slate-700">
                  {getTransportRouteBullets(transportRoutes).map((line) => (
                    <li key={line} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                      <span>{getTransportRouteBulletText(line)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {transportPricingData && !hasSavedTransportRates && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-900">
                  No saved Umrah transport rates found. Save route prices in Pricing first, then
                  return here to select Route and Transport Type.
                </p>
              )}

              <div className="space-y-2">
                {transportRoutes.map((route, routeIndex) => {
                  const routeOptions = getPricedRouteOptions(
                    transportPricingData,
                    route.vehicleTypeId,
                    route.kind,
                  )
                  const groupedRouteOptions = getGroupedRouteOptions(routeOptions)
                  const routeGbpCost =
                    route.costPriceGbp ??
                    convertTransportCostToGbp(route.costPrice, route.currency, transportPricingData)
                  const routeBaseGbpCost = route.baseCostPriceGbp ?? routeGbpCost
                  return (
                    <div
                      key={route.id}
                      className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                    >
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase text-slate-500">
                          Route
                        </span>
                        <select
                          value={route.routeId}
                          onChange={(event) =>
                            updateTransportRoute(routeIndex, {
                              routeId: event.target.value,
                              kind: getRouteKind(
                                transportPricingData?.routes.find(
                                  (item) => item.id === event.target.value,
                                )?.route_name || '',
                              ),
                            })
                          }
                          className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold outline-none focus:border-slate-900"
                        >
                          {groupedRouteOptions.map((group) => (
                            <optgroup key={group.category} label={group.category}>
                              {group.routes.map((routeOption) => (
                                <option key={routeOption.id} value={routeOption.id}>
                                  {routeOption.route_name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-black uppercase text-slate-500">
                          Transport type
                        </span>
                        <select
                          value={route.vehicleTypeId}
                          onChange={(event) =>
                            updateTransportRoute(routeIndex, {
                              vehicleTypeId: event.target.value,
                            })
                          }
                          className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold outline-none focus:border-slate-900"
                        >
                          {(transportPricingData?.vehicles || []).map((vehicle) => (
                            <option key={vehicle.id} value={vehicle.id}>
                              {vehicle.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="block">
                        <span className="block text-[10px] font-black uppercase text-slate-500">
                          Auto supplier
                        </span>
                        <div className="mt-1 min-h-9 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs font-black text-emerald-900">
                          {route.supplierName || 'No saved rate'}
                        </div>
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="min-h-9 flex-1 rounded-lg bg-slate-100 px-2 py-2 text-xs font-black text-slate-700">
                          {formatMoney(routeGbpCost || 0, 'GBP')}
                          {Number(route.damageRecoveryMarginAmountGbp || 0) > 0 && (
                            <span className="mt-0.5 block text-[10px] font-bold text-slate-500">
                              Base {formatMoney(routeBaseGbpCost || 0, 'GBP')} + recovery{' '}
                              {formatMoney(route.damageRecoveryMarginAmountGbp || 0, 'GBP')}
                            </span>
                          )}
                          {route.currency !== 'GBP' && (
                            <span className="mt-0.5 block text-[10px] font-bold text-slate-500">
                              {route.currency} {Number(route.costPrice || 0).toFixed(2)} at{' '}
                              {Number(route.exchangeRate || 0).toFixed(4)} SAR/GBP
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTransportRoute(routeIndex)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
                          title="Remove route"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {option.transportMainSupplierName && (
                <p className="mt-3 rounded-lg bg-white p-2 text-xs font-bold text-slate-600">
                  Main supplier by route count: {option.transportMainSupplierName}. Net transport
                  cost priced with this supplier:{' '}
                  {formatMoney(option.transportNetCost || 0, option.transportNetCurrency || 'GBP')}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {showQuantity && (
        <label className="mb-2 block">
          <span className="block text-xs font-bold text-slate-500">Quantity</span>
          <input
            value={option.quantity ?? quantityFallback ?? ''}
            onChange={(event) =>
              onChange({
                ...option,
                quantity: Number(event.target.value || 0) || undefined,
              })
            }
            type="number"
            min="1"
            step="1"
            className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
            placeholder="Number of travellers"
          />
        </label>
      )}
      <textarea
        value={option.summary}
        onChange={(event) => onChange({ ...option, summary: event.target.value })}
        placeholder={summaryPlaceholder}
        rows={3}
        className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
      />
      {showFlightPricing ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[
            ['Adult 12+', 'adultPrice'],
            ['Child 2-12', 'childPrice'],
            ['Infant under 2', 'infantPrice'],
          ].map(([label, key]) => (
            <label key={key} className="block">
              <span className="block text-xs font-bold text-slate-500">{label}</span>
              <div className="mt-1 flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
                <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                <input
                  value={option[key as 'adultPrice' | 'childPrice' | 'infantPrice'] || ''}
                  onChange={(event) =>
                    onChange({
                      ...option,
                      [key]: Number(event.target.value || 0),
                      pricingMode: 'per_person',
                    })
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="w-full bg-transparent text-sm font-bold outline-none"
                />
              </div>
            </label>
          ))}
        </div>
      ) : (
        <div
          className={`mt-2 grid gap-2 ${
            showHotelCostAudit
              ? 'grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))]'
              : 'sm:grid-cols-[minmax(0,1fr)_9.5rem]'
          }`}
        >
          {showHotelCostAudit && (
            <label className="block min-w-0">
              <span className="block text-xs font-bold text-slate-500">Search cost</span>
              <div className="mt-1 flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5">
                <span className="mr-2 shrink-0 text-sm font-black text-slate-500">GBP</span>
                <input
                  value={option.searchPrice || ''}
                  onChange={(event) =>
                    onChange({ ...option, searchPrice: Number(event.target.value || 0) })
                  }
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="min-w-0 w-full bg-transparent text-sm font-bold outline-none"
                />
              </div>
            </label>
          )}
          <label className="block min-w-0">
            <span className="block text-xs font-bold text-slate-500">
              {showHotelCostAudit ? 'Adj cost' : priceLabel}
            </span>
            <div className="mt-1 flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5">
              <span className="mr-2 shrink-0 text-sm font-black text-slate-500">GBP</span>
              <input
                value={
                  (showHotelCostAudit ? (option.adjustedPrice ?? option.price) : option.price) || ''
                }
                onChange={(event) =>
                  onChange({
                    ...option,
                    price: Number(event.target.value || 0),
                    ...(showHotelCostAudit
                      ? { adjustedPrice: Number(event.target.value || 0) }
                      : {}),
                  })
                }
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="min-w-0 w-full bg-transparent text-sm font-bold outline-none"
              />
            </div>
          </label>
          {showPricingMode && (
            <label className="block">
              <span className="block text-xs font-bold text-slate-500">Mode</span>
              <select
                value={option.pricingMode || 'total'}
                onChange={(event) =>
                  onChange({
                    ...option,
                    pricingMode: event.target.value as PackageComponentOption['pricingMode'],
                  })
                }
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-black outline-none focus:border-slate-900"
              >
                <option value="total">Total</option>
                <option value="per_person">Per person</option>
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  )
}

export default function PackagesClient({
  currentUserId,
  initialQuoteId = null,
}: PackagesClientProps) {
  const [payload, setPayload] = useState<PackageQuotePayload>(() => createInitialPayload())
  const [expiresAtInput, setExpiresAtInput] = useState(() =>
    toDateTimeLocalValue(getDefaultPackageExpiry()),
  )
  const [quotes, setQuotes] = useState<TravelPackageQuote[]>([])
  const [activeQuote, setActiveQuote] = useState<TravelPackageQuote | null>(null)
  const [quoteFilter, setQuoteFilter] = useState<QuoteFilter>('all')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [setupMessage, setSetupMessage] = useState<string | null>(null)
  const [cardProcessingExpanded, setCardProcessingExpanded] = useState(false)
  const [transportPricingData, setTransportPricingData] =
    useState<UmrahTransportPricingData | null>(null)
  const [packageGroups, setPackageGroups] = useState<TravelPackageGroup[]>([])
  const [activePackageGroup, setActivePackageGroup] = useState<TravelPackageGroupDetail | null>(
    null,
  )
  const [packageGroupLoading, setPackageGroupLoading] = useState(false)
  const [packageGroupSaving, setPackageGroupSaving] = useState(false)
  const [packageGroupSetupMessage, setPackageGroupSetupMessage] = useState<string | null>(null)
  const [packageGroupExpanded, setPackageGroupExpanded] = useState(false)
  const [newGroupTitle, setNewGroupTitle] = useState('')
  const [linkedFamilyLabel, setLinkedFamilyLabel] = useState('Family 1')
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const [packageGroupSearch, setPackageGroupSearch] = useState('')
  const [quoteGroupSearch, setQuoteGroupSearch] = useState('')
  const [selectedQuoteForGroupId, setSelectedQuoteForGroupId] = useState('')
  const [selectedQuoteFamilyLabel, setSelectedQuoteFamilyLabel] = useState('Family 2')
  const [sharedTransportNote, setSharedTransportNote] = useState('')

  const customerOptions = useMemo(() => buildCustomerPackageOptions(payload, 80), [payload])
  const systematicQuoteTitle = useMemo(() => buildSystematicQuoteTitle(payload), [payload])
  const baseCustomerOption = customerOptions[0]?.combination || null
  const servicePassengerCount =
    payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
  const payingGuestCount = payload.adults + payload.childrenPaying
  const shareUrl = buildShareUrl(activeQuote?.share_token)
  const filteredQuotes = useMemo(() => {
    if (quoteFilter === 'live') {
      return quotes.filter(
        (quote) =>
          quote.share_enabled &&
          quote.status === 'shared' &&
          !isPackageQuoteExpired(quote.expires_at),
      )
    }
    if (quoteFilter === 'draft') {
      return quotes.filter((quote) => quote.status === 'draft' || !quote.share_enabled)
    }
    if (quoteFilter === 'selected') {
      return quotes.filter((quote) => Boolean(quote.selected_at))
    }
    if (quoteFilter === 'expired') {
      return quotes.filter((quote) => isPackageQuoteExpired(quote.expires_at))
    }
    return quotes
  }, [quoteFilter, quotes])
  const filteredPackageGroups = useMemo(() => {
    const search = packageGroupSearch.trim().toLowerCase()
    if (!search) return packageGroups
    return packageGroups.filter((group) =>
      `${group.group_reference} ${group.title}`.toLowerCase().includes(search),
    )
  }, [packageGroupSearch, packageGroups])
  const filteredLinkableQuotes = useMemo(() => {
    const search = quoteGroupSearch.trim().toLowerCase()
    return quotes
      .filter((quote) => quote.id !== activeQuote?.id && quote.status !== 'archived')
      .filter((quote) => {
        if (!search) return true
        const quotePayload = normalizePackageQuotePayload(quote.payload)
        return `${quote.title} ${quote.customer_name || ''} ${quote.customer_phone || ''} ${
          quote.customer_email || ''
        } ${quotePayload.customerName} ${quotePayload.customerPhone} ${quotePayload.customerEmail}`
          .toLowerCase()
          .includes(search)
      })
  }, [activeQuote?.id, quoteGroupSearch, quotes])

  const updatePayload = (changes: Partial<PackageQuotePayload>) => {
    setPayload((current) => ({ ...current, ...changes }))
  }

  const applyPackageType = (packageType: TravelPackageType) => {
    const defaultStaySetup = createDefaultStaySetup(packageType)
    setPayload((current) => {
      const nextPayload = normalizePackageQuotePayload({
        ...current,
        packageType,
        itineraryOrder: defaultStaySetup.itineraryOrder,
        stayGroups: defaultStaySetup.stayGroups,
        transportOptions:
          packageType === 'holiday'
            ? [newOption('transport', { isDefault: true })]
            : current.transportOptions,
      })

      return {
        ...nextPayload,
        title: buildSystematicQuoteTitle(nextPayload),
      }
    })
  }

  const persistActiveQuotePayload = useCallback(
    async (nextPayload: PackageQuotePayload) => {
      if (!activeQuote) return null
      const payloadToSave = normalizePackageQuotePayload({
        ...nextPayload,
        title: buildSystematicQuoteTitle(nextPayload),
      })
      const response = await fetch(`/api/packages/${activeQuote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: payloadToSave }),
      })
      const data = (await response.json()) as SaveResponse
      if (data.setupRequired || !response.ok || !data.quote) {
        throw new Error(data.message || data.error || 'Failed to save linked package group')
      }
      setActiveQuote(data.quote)
      setPayload(normalizePackageQuotePayload(data.quote.payload))
      setQuotes((current) => {
        const next = current.filter((quote) => quote.id !== data.quote!.id)
        return [data.quote!, ...next]
      })
      return data.quote
    },
    [activeQuote],
  )

  const persistPackageGroupSnapshot = useCallback(
    async (group: TravelPackageGroupDetail) => {
      if (!activeQuote) return
      const snapshot = buildLinkedPackageGroupSnapshot(group, { quoteId: activeQuote.id })
      const nextPayload = normalizePackageQuotePayload({
        ...payload,
        linkedPackageGroup: snapshot,
      })
      setPayload(nextPayload)
      const transportNote =
        snapshot.sharedServices.find(
          (service) => service.serviceType === 'transport' && service.customerVisible,
        )?.customerNote || ''
      setSharedTransportNote(transportNote)
      await persistActiveQuotePayload(nextPayload)
    },
    [activeQuote, payload, persistActiveQuotePayload],
  )

  const persistUnlinkedPackageGroupSnapshot = useCallback(async () => {
    if (!activeQuote) return
    const nextPayload = normalizePackageQuotePayload({
      ...payload,
      linkedPackageGroup: null,
    })
    setPayload(nextPayload)
    await persistActiveQuotePayload(nextPayload)
  }, [activeQuote, payload, persistActiveQuotePayload])

  const loadQuotes = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/packages')
      const data = (await response.json()) as PackagesResponse
      if (!response.ok)
        throw new Error((data as { error?: string }).error || 'Failed to load packages')
      const loadedQuotes = data.packages || []
      setQuotes(loadedQuotes)
      if (initialQuoteId) {
        const initialQuote = loadedQuotes.find((quote) => quote.id === initialQuoteId)
        if (initialQuote) {
          setActiveQuote(initialQuote)
          setPayload(withSystematicQuoteTitle(normalizePackageQuotePayload(initialQuote.payload)))
          setExpiresAtInput(toDateTimeLocalValue(initialQuote.expires_at))
        }
      }
      setSetupMessage(
        data.setupRequired ? data.message || 'Package quote schema is required.' : null,
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load packages')
    } finally {
      setLoading(false)
    }
  }, [initialQuoteId])

  useEffect(() => {
    void loadQuotes()
  }, [loadQuotes])

  useEffect(() => {
    const loadTransportPricing = async () => {
      try {
        const response = await fetch('/api/pricing/umrah-transport')
        const data = (await response.json()) as UmrahTransportPricingData
        if (!response.ok)
          throw new Error((data as { error?: string }).error || 'Failed to load transport pricing')
        setTransportPricingData(data.setupRequired ? null : data)
      } catch (error) {
        console.error('[PackagesClient] Failed to load Umrah transport pricing:', error)
      }
    }

    void loadTransportPricing()
  }, [])

  const applyPackageGroupSnapshot = useCallback(
    (group: TravelPackageGroupDetail | null) => {
      if (!group || !activeQuote) return
      const snapshot = buildLinkedPackageGroupSnapshot(group, { quoteId: activeQuote.id })
      updatePayload({ linkedPackageGroup: snapshot })
      const transportNote =
        snapshot.sharedServices.find(
          (service) => service.serviceType === 'transport' && service.customerVisible,
        )?.customerNote || ''
      setSharedTransportNote(transportNote)
    },
    [activeQuote],
  )

  const loadPackageGroupDetail = useCallback(
    async (groupId: string, applySnapshot = true) => {
      if (!groupId) return null
      const response = await fetch(`/api/travel-package-groups/${groupId}`)
      const data = (await response.json()) as PackageGroupResponse
      if (!response.ok || data.setupRequired || !data.group) {
        if (data.setupRequired) {
          setPackageGroupSetupMessage(data.message || 'Linked package group schema is required.')
          return null
        }
        throw new Error(data.error || 'Failed to load linked package group')
      }
      const detail = data.group as TravelPackageGroupDetail
      setActivePackageGroup(detail)
      setSelectedGroupId(detail.id)
      setNewGroupTitle(detail.title)
      const currentMember = detail.members.find((member) => member.quote_id === activeQuote?.id)
      if (currentMember?.family_label) setLinkedFamilyLabel(currentMember.family_label)
      const transportNote =
        detail.sharedServices.find(
          (service) => service.service_type === 'transport' && service.customer_visible,
        )?.customer_note || ''
      setSharedTransportNote(transportNote)
      if (applySnapshot) applyPackageGroupSnapshot(detail)
      return detail
    },
    [activeQuote?.id, applyPackageGroupSnapshot],
  )

  const loadPackageGroups = useCallback(async () => {
    setPackageGroupLoading(true)
    try {
      const [allResponse, linkedResponse] = await Promise.all([
        fetch('/api/travel-package-groups'),
        activeQuote?.id
          ? fetch(`/api/travel-package-groups?quoteId=${activeQuote.id}`)
          : Promise.resolve(null),
      ])
      const allData = (await allResponse.json()) as PackageGroupsResponse
      if (!allResponse.ok || allData.setupRequired) {
        if (allData.setupRequired) {
          setPackageGroupSetupMessage(allData.message || 'Linked package group schema is required.')
          setPackageGroups([])
          return
        }
        throw new Error(allData.error || 'Failed to load package groups')
      }
      setPackageGroups(allData.groups || [])
      setPackageGroupSetupMessage(null)

      if (!linkedResponse) {
        setActivePackageGroup(null)
        setSelectedGroupId('')
        return
      }

      const linkedData = (await linkedResponse.json()) as PackageGroupsResponse
      if (!linkedResponse.ok || linkedData.setupRequired) return
      const linkedGroup = linkedData.groups?.[0]
      if (linkedGroup) {
        await loadPackageGroupDetail(linkedGroup.id)
      } else {
        setActivePackageGroup(null)
        setSelectedGroupId('')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load linked package groups')
    } finally {
      setPackageGroupLoading(false)
    }
  }, [activeQuote?.id, loadPackageGroupDetail])

  useEffect(() => {
    void loadPackageGroups()
  }, [loadPackageGroups])

  useEffect(() => {
    if (!activeQuote) {
      setActivePackageGroup(null)
      setSelectedGroupId('')
      setLinkedFamilyLabel('Family 1')
      setSharedTransportNote(payload.linkedPackageGroup?.sharedServices[0]?.customerNote || '')
    }
  }, [activeQuote, payload.linkedPackageGroup?.sharedServices])

  const updateStayGroup = (groupIndex: number, nextGroup: PackageStayGroup) => {
    const nextGroups = payload.stayGroups.map((group, index) =>
      index === groupIndex ? nextGroup : group,
    )
    updatePayload({
      stayGroups: nextGroups,
      itineraryOrder: nextGroups.map((group) => group.id),
    })
  }

  const updateComponentOption = (
    key: 'flightOptions' | 'visaOptions' | 'transportOptions',
    optionIndex: number,
    nextOption: PackageComponentOption,
  ) => {
    const nextOptions = payload[key].map((option, index) =>
      index === optionIndex ? nextOption : option,
    )
    const supportsDefault = key === 'flightOptions' || key === 'transportOptions'
    const linkedFlightGroups =
      key === 'flightOptions'
        ? payload.linkedFlightGroups.map((group) =>
            group.baseFlightOptionId === payload.flightOptions[optionIndex]?.id
              ? { ...group, baseFlightOptionId: nextOption.id }
              : group,
          )
        : payload.linkedFlightGroups
    updatePayload({
      [key]:
        supportsDefault && nextOption.isDefault
          ? nextOptions.map((option, index) => ({ ...option, isDefault: index === optionIndex }))
          : nextOptions,
      linkedFlightGroups,
    } as Partial<PackageQuotePayload>)
  }

  const removeComponentOption = (
    key: 'flightOptions' | 'visaOptions' | 'transportOptions',
    optionIndex: number,
  ) => {
    const current = payload[key]
    const removedId = current[optionIndex]?.id
    updatePayload({
      [key]: current.filter((_, index) => index !== optionIndex),
      linkedFlightGroups:
        key === 'flightOptions'
          ? payload.linkedFlightGroups.filter((group) => group.baseFlightOptionId !== removedId)
          : payload.linkedFlightGroups,
    } as Partial<PackageQuotePayload>)
  }

  const addComponentOption = (
    key: 'flightOptions' | 'visaOptions' | 'transportOptions',
    prefix: string,
  ) => {
    updatePayload({
      [key]: [
        ...payload[key],
        newOption(prefix, {
          isDefault:
            (key === 'flightOptions' && payload.flightOptions.length === 0) ||
            (key === 'transportOptions' && payload.transportOptions.length === 0),
          quantity:
            key === 'visaOptions' && servicePassengerCount > 0 ? servicePassengerCount : undefined,
        }),
      ],
    } as Partial<PackageQuotePayload>)
  }

  const addLinkedFlightGroup = (baseFlightOptionId: string) => {
    updatePayload({
      linkedFlightGroups: [...payload.linkedFlightGroups, newLinkedFlightGroup(baseFlightOptionId)],
    })
  }

  const updateLinkedFlightGroup = (groupId: string, nextGroup: PackageLinkedFlightGroup) => {
    updatePayload({
      linkedFlightGroups: payload.linkedFlightGroups.map((group) =>
        group.id === groupId ? nextGroup : group,
      ),
    })
  }

  const removeLinkedFlightGroup = (groupId: string) => {
    updatePayload({
      linkedFlightGroups: payload.linkedFlightGroups.filter((group) => group.id !== groupId),
    })
  }

  const updateLimitedTimeOffer = (offerIndex: number, nextOffer: PackageLimitedTimeOffer) => {
    updatePayload({
      limitedTimeOffers: payload.limitedTimeOffers.map((offer, index) =>
        index === offerIndex ? nextOffer : offer,
      ),
    })
  }

  const removeLimitedTimeOffer = (offerIndex: number) => {
    updatePayload({
      limitedTimeOffers: payload.limitedTimeOffers.filter((_, index) => index !== offerIndex),
    })
  }

  const addLimitedTimeOffer = () => {
    updatePayload({ limitedTimeOffers: [...payload.limitedTimeOffers, newLimitedTimeOffer()] })
  }

  const upsertSharedTransportNote = async (group: TravelPackageGroupDetail, note: string) => {
    const existingService = group.sharedServices.find(
      (service) => service.service_type === 'transport',
    )
    const endpoint = `/api/travel-package-groups/${group.id}/shared-services`
    const response = await fetch(endpoint, {
      method: existingService ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        existingService
          ? {
              sharedServiceId: existingService.id,
              customerNote: note,
              customerVisible: Boolean(note.trim()),
            }
          : {
              serviceType: 'transport',
              title: 'Shared transport',
              customerNote: note,
              customerVisible: Boolean(note.trim()),
              allocationMode: 'no_split_note_only',
            },
      ),
    })
    const data = (await response.json()) as {
      error?: string
      setupRequired?: boolean
      message?: string
    }
    if (!response.ok || data.setupRequired) {
      throw new Error(data.message || data.error || 'Failed to save shared transport note')
    }
  }

  const buildQuoteGroupMemberMetadata = (quote: TravelPackageQuote) => {
    const quotePayload = normalizePackageQuotePayload(quote.payload)
    return {
      quoteTitle: quote.title,
      customerName: quote.customer_name || quotePayload.customerName,
      customerPhone: quote.customer_phone || quotePayload.customerPhone,
      customerEmail: quote.customer_email || quotePayload.customerEmail,
    }
  }

  const formatQuoteGroupOptionLabel = (quote: TravelPackageQuote) => {
    const quotePayload = normalizePackageQuotePayload(quote.payload)
    const customerName = quote.customer_name || quotePayload.customerName || 'No customer'
    const createdDate = new Date(quote.created_at).toLocaleDateString('en-GB')
    return `${quote.title} - ${customerName} - ${createdDate}`
  }

  const createPackageGroup = async () => {
    if (!activeQuote) {
      toast.error('Save the quote before creating a linked package group')
      return
    }
    const title =
      newGroupTitle.trim() || `${payload.customerName || 'Linked families'} package group`
    setPackageGroupSaving(true)
    try {
      const response = await fetch('/api/travel-package-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          leadQuoteId: activeQuote.id,
          familyLabel: linkedFamilyLabel || 'Family 1',
          customerVisible: true,
          metadata: buildQuoteGroupMemberMetadata(activeQuote),
        }),
      })
      const data = (await response.json()) as PackageGroupResponse
      if (!response.ok || data.setupRequired || !data.group) {
        throw new Error(data.message || data.error || 'Failed to create linked package group')
      }
      const createdGroup = data.group as TravelPackageGroup
      let detail = await loadPackageGroupDetail(createdGroup.id, false)
      if (detail && sharedTransportNote.trim()) {
        await upsertSharedTransportNote(detail, sharedTransportNote)
        detail = await loadPackageGroupDetail(createdGroup.id, false)
      }
      if (detail) await persistPackageGroupSnapshot(detail)
      await loadPackageGroups()
      toast.success('Linked package group created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create linked package group')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const linkSelectedPackageGroup = async () => {
    if (!activeQuote) {
      toast.error('Save the quote before linking it to a package group')
      return
    }
    if (!selectedGroupId) {
      toast.error('Select a package group to link')
      return
    }
    setPackageGroupSaving(true)
    try {
      const response = await fetch(`/api/travel-package-groups/${selectedGroupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: activeQuote.id,
          familyLabel: linkedFamilyLabel || 'Family',
          customerVisible: true,
          metadata: buildQuoteGroupMemberMetadata(activeQuote),
        }),
      })
      const data = (await response.json()) as {
        error?: string
        setupRequired?: boolean
        message?: string
      }
      if (!response.ok || data.setupRequired) {
        throw new Error(data.message || data.error || 'Failed to link quote to package group')
      }
      let detail = await loadPackageGroupDetail(selectedGroupId, false)
      if (detail && sharedTransportNote.trim()) {
        await upsertSharedTransportNote(detail, sharedTransportNote)
        detail = await loadPackageGroupDetail(selectedGroupId, false)
      }
      if (detail) await persistPackageGroupSnapshot(detail)
      await loadPackageGroups()
      toast.success('Quote linked to package group')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link package group')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const linkSelectedQuoteToPackageGroup = async () => {
    if (!activeQuote) {
      toast.error('Save this quote before linking another quotation')
      return
    }
    const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteForGroupId)
    if (!selectedQuote) {
      toast.error('Select an existing quotation to link')
      return
    }
    setPackageGroupSaving(true)
    try {
      let groupId = activePackageGroup?.id || ''

      if (!groupId) {
        const groupTitle =
          newGroupTitle.trim() ||
          `${payload.customerName || activeQuote.customer_name || 'Linked families'} group`
        const createResponse = await fetch('/api/travel-package-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: groupTitle,
            leadQuoteId: activeQuote.id,
            familyLabel: linkedFamilyLabel || 'Family 1',
            customerVisible: true,
            metadata: buildQuoteGroupMemberMetadata(activeQuote),
          }),
        })
        const createData = (await createResponse.json()) as PackageGroupResponse
        if (!createResponse.ok || createData.setupRequired || !createData.group) {
          throw new Error(
            createData.message || createData.error || 'Failed to create linked package group',
          )
        }
        groupId = createData.group.id
      }

      const linkResponse = await fetch(`/api/travel-package-groups/${groupId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: selectedQuote.id,
          familyLabel:
            selectedQuoteFamilyLabel ||
            selectedQuote.customer_name ||
            normalizePackageQuotePayload(selectedQuote.payload).customerName ||
            'Family 2',
          customerVisible: true,
          metadata: buildQuoteGroupMemberMetadata(selectedQuote),
        }),
      })
      const linkData = (await linkResponse.json()) as {
        error?: string
        setupRequired?: boolean
        message?: string
      }
      if (!linkResponse.ok || linkData.setupRequired) {
        throw new Error(linkData.message || linkData.error || 'Failed to link selected quotation')
      }

      let detail = await loadPackageGroupDetail(groupId, false)
      if (detail && sharedTransportNote.trim()) {
        await upsertSharedTransportNote(detail, sharedTransportNote)
        detail = await loadPackageGroupDetail(groupId, false)
      }
      if (detail) await persistPackageGroupSnapshot(detail)
      setSelectedQuoteForGroupId('')
      setQuoteGroupSearch('')
      setSelectedQuoteFamilyLabel('Family 2')
      await loadPackageGroups()
      toast.success('Quotation linked to package group')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link selected quotation')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const saveSharedTransportNote = async () => {
    if (!activePackageGroup) {
      toast.error('Create or link a package group first')
      return
    }
    setPackageGroupSaving(true)
    try {
      await upsertSharedTransportNote(activePackageGroup, sharedTransportNote)
      const detail = await loadPackageGroupDetail(activePackageGroup.id, false)
      if (detail) await persistPackageGroupSnapshot(detail)
      toast.success('Shared transport note updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save shared transport note')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const unlinkCurrentQuoteFromGroup = async () => {
    const member = activePackageGroup?.members.find(
      (candidate) => candidate.quote_id === activeQuote?.id,
    )
    if (!activePackageGroup || !member) {
      toast.error('This quote is not linked to the active package group')
      return
    }
    setPackageGroupSaving(true)
    try {
      const response = await fetch(
        `/api/travel-package-groups/${activePackageGroup.id}/members?memberId=${member.id}`,
        { method: 'DELETE' },
      )
      const data = (await response.json()) as {
        error?: string
        message?: string
        setupRequired?: boolean
      }
      if (!response.ok || data.setupRequired) {
        throw new Error(data.message || data.error || 'Failed to unlink package group')
      }
      setActivePackageGroup(null)
      setSelectedGroupId('')
      setSharedTransportNote('')
      await persistUnlinkedPackageGroupSnapshot()
      await loadPackageGroups()
      toast.success('Quote unlinked from package group')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unlink package group')
    } finally {
      setPackageGroupSaving(false)
    }
  }

  const saveQuote = async (shareEnabled: boolean) => {
    setSaving(true)
    try {
      const payloadToSave = normalizePackageQuotePayload({
        ...payload,
        title: systematicQuoteTitle,
      })
      const response = await fetch(
        activeQuote ? `/api/packages/${activeQuote.id}` : '/api/packages',
        {
          method: activeQuote ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: payloadToSave,
            expiresAt: fromDateTimeLocalValue(expiresAtInput),
            shareEnabled,
          }),
        },
      )
      const data = (await response.json()) as SaveResponse

      if (data.setupRequired) {
        setSetupMessage(data.message || 'Package quote schema is required.')
        toast.error('Package schema is not installed yet')
        return
      }

      if (!response.ok || !data.quote) {
        throw new Error(data.error || 'Failed to save package quote')
      }

      setActiveQuote(data.quote)
      setPayload(normalizePackageQuotePayload(data.quote.payload))
      setExpiresAtInput(toDateTimeLocalValue(data.quote.expires_at))
      setQuotes((current) => {
        const next = current.filter((quote) => quote.id !== data.quote!.id)
        return [data.quote!, ...next]
      })
      toast.success(shareEnabled ? 'Package saved and share link enabled' : 'Package draft saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save package quote')
    } finally {
      setSaving(false)
    }
  }

  const archiveQuote = async () => {
    if (!activeQuote) return
    setSaving(true)
    try {
      const response = await fetch(`/api/packages/${activeQuote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'archived', shareEnabled: false }),
      })
      const data = (await response.json()) as SaveResponse
      if (!response.ok) throw new Error(data.error || 'Failed to archive quote')
      setQuotes((current) => current.filter((quote) => quote.id !== activeQuote.id))
      setActiveQuote(null)
      setPayload(createInitialPayload())
      setExpiresAtInput(toDateTimeLocalValue(getDefaultPackageExpiry()))
      toast.success('Package quote archived')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive quote')
    } finally {
      setSaving(false)
    }
  }

  const copyAllOptions = async () => {
    if (customerOptions.length === 0) return
    const text = formatPackageQuoteForCopy(
      { ...payload, title: systematicQuoteTitle },
      12,
      activeQuote?.share_enabled ? shareUrl : '',
    )
    await navigator.clipboard.writeText(text)
    toast.success('Package options copied')
  }

  const copyShareLink = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    toast.success('Customer link copied')
  }

  const copyQuoteShareLink = async (quote: TravelPackageQuote) => {
    const url = buildShareUrl(quote.share_token)
    if (!url) return
    await navigator.clipboard.writeText(url)
    toast.success('Customer link copied')
  }

  const openQuoteForEdit = (quote: TravelPackageQuote) => {
    const normalizedPayload = withSystematicQuoteTitle(normalizePackageQuotePayload(quote.payload))
    setActiveQuote(quote)
    setPayload(normalizedPayload)
    setExpiresAtInput(toDateTimeLocalValue(quote.expires_at))
    setSelectedQuoteForGroupId('')
    setQuoteGroupSearch('')
    setSelectedQuoteFamilyLabel('Family 2')
    setSharedTransportNote(
      normalizedPayload.linkedPackageGroup?.sharedServices.find(
        (service) => service.serviceType === 'transport' && service.customerVisible,
      )?.customerNote || '',
    )
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const duplicateQuote = (quote: TravelPackageQuote) => {
    const sourcePayload = normalizePackageQuotePayload(quote.payload)
    const duplicatedPayload = withSystematicQuoteTitle(
      { ...sourcePayload, linkedPackageGroup: null },
      makeQuoteShortRef(),
    )
    setActiveQuote(null)
    setActivePackageGroup(null)
    setSelectedGroupId('')
    setPackageGroupSearch('')
    setSelectedQuoteForGroupId('')
    setQuoteGroupSearch('')
    setSelectedQuoteFamilyLabel('Family 2')
    setSharedTransportNote('')
    setPayload(duplicatedPayload)
    setExpiresAtInput(toDateTimeLocalValue(getDefaultPackageExpiry()))
    window.scrollTo({ top: 0, behavior: 'smooth' })
    toast.success('Quote duplicated as a new draft. Review it, then save.')
  }

  const startNew = () => {
    setActiveQuote(null)
    setActivePackageGroup(null)
    setSelectedGroupId('')
    setPackageGroupSearch('')
    setSelectedQuoteForGroupId('')
    setQuoteGroupSearch('')
    setSelectedQuoteFamilyLabel('Family 2')
    setNewGroupTitle('')
    setLinkedFamilyLabel('Family 1')
    setSharedTransportNote('')
    setPayload(createInitialPayload())
    setExpiresAtInput(toDateTimeLocalValue(getDefaultPackageExpiry()))
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Link
            href="/dashboard/packages"
            className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-slate-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Packages
          </Link>
          <p className="text-xs font-bold text-slate-500">Package creator</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950">Holidays, ziyarat and umrah</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Build hotel, flight and transport options, save the quote, then share a customer link
            where they can choose their preferred mix and see the live total.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startNew}
            className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            New
          </button>
          {activeQuote && (
            <button
              type="button"
              onClick={() => duplicateQuote(activeQuote)}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-900 transition hover:bg-blue-100"
            >
              <CopyPlus className="h-4 w-4" />
              Duplicate
            </button>
          )}
          {activeQuote && (
            <a
              href={`/dashboard/packages/quotations/${activeQuote.id}/sales`}
              className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
            >
              <PackageCheck className="h-4 w-4" />
              Sales Mode
            </a>
          )}
          <button
            type="button"
            onClick={() => void saveQuote(false)}
            disabled={saving}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-bold text-white transition hover:bg-black disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save
          </button>
          <button
            type="button"
            onClick={() => void saveQuote(true)}
            disabled={saving}
            className="flex min-h-10 items-center gap-2 rounded-lg bg-[#8b1e2d] px-3 text-sm font-bold text-white transition hover:bg-[#6f1422] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Save & Share
          </button>
        </div>
      </div>

      {setupMessage && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {setupMessage}
        </div>
      )}

      {shareUrl && activeQuote?.share_enabled && (
        <div
          className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
            isPackageQuoteExpired(activeQuote.expires_at)
              ? 'border-red-200 bg-red-50'
              : 'border-emerald-200 bg-emerald-50'
          }`}
        >
          <div className="min-w-0">
            <p
              className={`text-sm font-black ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-900' : 'text-emerald-900'
              }`}
            >
              {isPackageQuoteExpired(activeQuote.expires_at)
                ? 'Customer link has expired'
                : 'Customer link is active'}
            </p>
            <p
              className={`truncate text-sm ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-800' : 'text-emerald-800'
              }`}
            >
              {shareUrl}
            </p>
            <p
              className={`mt-1 text-xs font-bold ${
                isPackageQuoteExpired(activeQuote.expires_at) ? 'text-red-700' : 'text-emerald-700'
              }`}
            >
              Expires {formatExpiry(activeQuote.expires_at)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyShareLink()}
            disabled={isPackageQuoteExpired(activeQuote.expires_at)}
            className="flex min-h-10 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Link2 className="h-4 w-4" />
            Copy Link
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)] 2xl:grid-cols-[minmax(0,3fr)_minmax(20rem,1fr)]">
        <div className="space-y-5">
          <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 shadow-sm">
            <SectionHeader icon={PackageCheck} title="Quote details" />
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block md:col-span-2">
                <span className="mb-1 block text-xs font-bold text-blue-800">
                  System quote name
                </span>
                <input
                  value={systematicQuoteTitle}
                  readOnly
                  className="min-h-11 w-full rounded-lg border border-blue-200 bg-white px-3 text-sm font-bold text-slate-900 outline-none"
                />
                <p className="mt-1 text-xs font-semibold text-blue-700">
                  Generated from package type, quote date, and a unique six-character reference.
                </p>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Type</span>
                <select
                  value={payload.packageType}
                  onChange={(event) => applyPackageType(event.target.value as TravelPackageType)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                >
                  {PACKAGE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Customer name</span>
                <input
                  value={payload.customerName}
                  onChange={(event) => updatePayload({ customerName: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Phone</span>
                <input
                  value={payload.customerPhone}
                  onChange={(event) => updatePayload({ customerPhone: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Email</span>
                <input
                  value={payload.customerEmail}
                  onChange={(event) => updatePayload({ customerEmail: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  Quote expires
                </span>
                <input
                  type="datetime-local"
                  value={expiresAtInput}
                  min={toDateTimeLocalValue(new Date().toISOString())}
                  onChange={(event) => setExpiresAtInput(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Default is 72 hours from quote creation.
                </p>
              </label>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              {[
                ['Adults 12+', 'adults'],
                ['Children 5+', 'childrenPaying'],
                ['Children 2-5', 'childrenFree'],
                ['Infants under 2', 'infants'],
              ].map(([label, key]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">{label}</span>
                  <input
                    type="number"
                    min="0"
                    value={payload[key as 'adults' | 'childrenPaying' | 'childrenFree' | 'infants']}
                    onChange={(event) =>
                      updatePayload({
                        [key]: Number(event.target.value || 0),
                      } as Partial<PackageQuotePayload>)
                    }
                    className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                  />
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Departure</span>
                <input
                  type="date"
                  value={payload.departureDate}
                  onChange={(event) => updatePayload({ departureDate: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-500">Return</span>
                <input
                  type="date"
                  value={payload.returnDate}
                  onChange={(event) => updatePayload({ returnDate: event.target.value })}
                  className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
                />
              </label>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <button
                type="button"
                onClick={() => setCardProcessingExpanded((current) => !current)}
                className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left transition hover:bg-slate-50"
                aria-expanded={cardProcessingExpanded}
              >
                <span className="flex min-w-0 items-center gap-2 text-xs font-black text-slate-700">
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Credit Card processing fee</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-500">
                  {(payload.cardProcessingFeePercent || 0).toFixed(2)}%
                  <ChevronDown
                    className={`h-4 w-4 transition ${cardProcessingExpanded ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
              {cardProcessingExpanded && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-bold text-slate-500">
                    Processing fee percentage
                  </span>
                  <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payload.cardProcessingFeePercent || ''}
                      onChange={(event) =>
                        updatePayload({
                          cardProcessingFeePercent: Number(event.target.value || 0),
                        })
                      }
                      className="w-full bg-transparent text-sm font-bold outline-none"
                      placeholder="0.00"
                    />
                    <span className="ml-2 text-sm font-black text-slate-500">%</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Applied only to the Credit Card amount. Processing fees are non-refundable.
                  </p>
                </label>
              )}
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
                <button
                  type="button"
                  onClick={() => updatePayload({ depositRequired: !payload.depositRequired })}
                  className={`min-h-11 rounded-lg px-3 text-sm font-black transition ${
                    payload.depositRequired
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {payload.depositRequired ? 'Deposit required to secure' : 'No deposit required'}
                </button>
                <label className="block">
                  <span className="sr-only">Deposit amount</span>
                  <div className="flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-3">
                    <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={payload.depositAmount || ''}
                      onChange={(event) =>
                        updatePayload({ depositAmount: Number(event.target.value || 0) })
                      }
                      disabled={!payload.depositRequired}
                      className="w-full bg-transparent text-sm font-bold outline-none disabled:text-slate-400"
                      placeholder="Deposit"
                    />
                  </div>
                </label>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {payload.packageType === 'holiday' ? (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="block text-xs font-bold text-slate-500">
                      Holiday starting point
                    </span>
                    <p className="mt-1 text-sm font-black text-slate-900">
                      {payload.stayGroups[0]?.label || 'Location 1'}
                    </p>
                  </div>
                  <span className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800">
                    Location 1 is automatically first
                  </span>
                </div>
              ) : (
                <>
                  <span className="mb-2 block text-xs font-bold text-slate-500">
                    Itinerary order
                  </span>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        label: 'Makkah first',
                        order: ['makkah', 'madinah'],
                      },
                      {
                        label: 'Madinah first',
                        order: ['madinah', 'makkah'],
                      },
                    ].map((item) => {
                      const active =
                        item.order.join('|') === payload.itineraryOrder.slice(0, 2).join('|')
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => updatePayload({ itineraryOrder: item.order })}
                          className={`min-h-10 rounded-lg px-3 text-sm font-black transition ${
                            active
                              ? 'bg-slate-900 text-white'
                              : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <Link2 className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-lg font-black text-slate-950">Linked package group</h2>
                  <p className="mt-1 truncate text-xs font-semibold text-cyan-900">
                    {activePackageGroup
                      ? `${activePackageGroup.group_reference} - ${activePackageGroup.title}`
                      : activeQuote
                        ? 'No linked group active'
                        : 'Save this quote first to link family packages'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPackageGroupExpanded((current) => !current)}
                className="flex min-h-9 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-white px-3 text-sm font-black text-cyan-900 transition hover:bg-cyan-50"
                aria-expanded={packageGroupExpanded}
              >
                {packageGroupExpanded ? 'Hide details' : 'Show details'}
                <ChevronDown
                  className={`h-4 w-4 transition ${packageGroupExpanded ? 'rotate-180' : ''}`}
                />
              </button>
            </div>
            {activePackageGroup && (
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-lg bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900">
                  {activePackageGroup.members.length} linked quote
                  {activePackageGroup.members.length === 1 ? '' : 's'}
                </span>
                {activePackageGroup.members.slice(0, 4).map((member) => (
                  <span
                    key={member.id}
                    className={`rounded-lg px-2 py-1 text-xs font-bold ${
                      member.quote_id === activeQuote?.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-white text-slate-700'
                    }`}
                  >
                    {member.family_label}
                  </span>
                ))}
                {activePackageGroup.members.length > 4 && (
                  <span className="rounded-lg bg-white px-2 py-1 text-xs font-bold text-slate-500">
                    +{activePackageGroup.members.length - 4} more
                  </span>
                )}
              </div>
            )}
            {packageGroupExpanded && (
              <div className="mt-4">
                {packageGroupSetupMessage && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                    {packageGroupSetupMessage}
                  </div>
                )}
                {!activeQuote ? (
                  <div className="rounded-lg border border-dashed border-cyan-300 bg-white/80 p-4 text-sm font-semibold text-cyan-900">
                    Save this quote first, then link it with another family package for shared
                    transport.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                      <div className="rounded-lg border border-cyan-200 bg-white p-3">
                        <p className="text-sm font-black text-slate-950">Create new group</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Group name
                            </span>
                            <input
                              value={newGroupTitle}
                              onChange={(event) => setNewGroupTitle(event.target.value)}
                              placeholder={`${payload.customerName || 'Linked families'} package group`}
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              This family label
                            </span>
                            <input
                              value={linkedFamilyLabel}
                              onChange={(event) => setLinkedFamilyLabel(event.target.value)}
                              placeholder="Family Ali"
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-cyan-700"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void createPackageGroup()}
                            disabled={packageGroupSaving}
                            className="self-end min-h-11 rounded-lg bg-cyan-900 px-3 text-sm font-black text-white transition hover:bg-cyan-950 disabled:opacity-50"
                          >
                            Create & Link
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-cyan-200 bg-white p-3">
                        <p className="text-sm font-black text-slate-950">Link existing group</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
                          <label className="block md:col-span-2">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Search groups
                            </span>
                            <input
                              value={packageGroupSearch}
                              onChange={(event) => setPackageGroupSearch(event.target.value)}
                              placeholder="Search by group ref or name"
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-cyan-700"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Package group
                            </span>
                            <select
                              value={selectedGroupId}
                              onChange={(event) => setSelectedGroupId(event.target.value)}
                              disabled={packageGroupLoading}
                              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-cyan-700 disabled:text-slate-400"
                            >
                              <option value="">
                                {packageGroupLoading ? 'Loading groups...' : 'Select group'}
                              </option>
                              {filteredPackageGroups.map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.group_reference} - {group.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={() => void linkSelectedPackageGroup()}
                            disabled={packageGroupSaving || !selectedGroupId}
                            className="self-end min-h-11 rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-sm font-black text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-50"
                          >
                            Link
                          </button>
                        </div>
                      </div>

                      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 lg:col-span-2">
                        <p className="text-sm font-black text-slate-950">Link existing quotation</p>
                        <p className="mt-1 text-xs font-semibold text-blue-900">
                          Use this when both families already have separate quotations and no linked
                          group has been created yet.
                        </p>
                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem]">
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Search quotations
                            </span>
                            <input
                              value={quoteGroupSearch}
                              onChange={(event) => setQuoteGroupSearch(event.target.value)}
                              placeholder="Search by quote, customer, phone or email"
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-blue-700"
                            />
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Existing quotation
                            </span>
                            <select
                              value={selectedQuoteForGroupId}
                              onChange={(event) => setSelectedQuoteForGroupId(event.target.value)}
                              disabled={loading}
                              className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-blue-700 disabled:text-slate-400"
                            >
                              <option value="">
                                {loading ? 'Loading quotes...' : 'Select quotation'}
                              </option>
                              {filteredLinkableQuotes.map((quote) => (
                                <option key={quote.id} value={quote.id}>
                                  {formatQuoteGroupOptionLabel(quote)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-bold text-slate-500">
                              Their family label
                            </span>
                            <input
                              value={selectedQuoteFamilyLabel}
                              onChange={(event) => setSelectedQuoteFamilyLabel(event.target.value)}
                              placeholder="Family Hussain"
                              className="min-h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-blue-700"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => void linkSelectedQuoteToPackageGroup()}
                            disabled={packageGroupSaving || !selectedQuoteForGroupId}
                            className="min-h-11 rounded-lg bg-blue-900 px-3 text-sm font-black text-white transition hover:bg-blue-950 disabled:opacity-50 md:col-start-3"
                          >
                            {activePackageGroup ? 'Add Quote' : 'Create Group'}
                          </button>
                          {!loading && filteredLinkableQuotes.length === 0 && (
                            <p className="text-xs font-semibold text-slate-500 md:col-span-3">
                              No matching saved quotations found.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-cyan-200 bg-white p-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-sm font-black text-slate-950">
                            {activePackageGroup
                              ? `${activePackageGroup.group_reference} - ${activePackageGroup.title}`
                              : 'No linked group active'}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-500">
                            Customer output will only show the note. Internal shared transport costs
                            stay hidden.
                          </p>
                        </div>
                        {activePackageGroup && (
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-lg bg-cyan-100 px-3 py-1 text-xs font-black text-cyan-900">
                              {activePackageGroup.members.length} linked quote
                              {activePackageGroup.members.length === 1 ? '' : 's'}
                            </span>
                            <button
                              type="button"
                              onClick={() => void unlinkCurrentQuoteFromGroup()}
                              disabled={packageGroupSaving}
                              className="min-h-7 rounded-lg border border-red-200 px-3 text-xs font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              Unlink
                            </button>
                          </div>
                        )}
                      </div>
                      {activePackageGroup && activePackageGroup.members.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {activePackageGroup.members.map((member) => (
                            <span
                              key={member.id}
                              className={`rounded-lg px-2 py-1 text-xs font-bold ${
                                member.quote_id === activeQuote.id
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {member.family_label}
                            </span>
                          ))}
                        </div>
                      )}
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">
                          Shared transport customer note
                        </span>
                        <textarea
                          value={sharedTransportNote}
                          onChange={(event) => setSharedTransportNote(event.target.value)}
                          placeholder="Transport is shared with Family Hussain / PT-ABC123."
                          rows={3}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-cyan-700"
                        />
                      </label>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void saveSharedTransportNote()}
                          disabled={packageGroupSaving || !activePackageGroup}
                          className="min-h-10 rounded-lg bg-slate-900 px-3 text-sm font-black text-white transition hover:bg-black disabled:opacity-50"
                        >
                          Save Transport Note
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            activePackageGroup && applyPackageGroupSnapshot(activePackageGroup)
                          }
                          disabled={!activePackageGroup}
                          className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
                        >
                          Refresh Snapshot
                        </button>
                      </div>
                      {payload.linkedPackageGroup && (
                        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                          Snapshot ready on this quote. Press Save to persist it.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 shadow-sm">
              <SectionHeader
                icon={Plane}
                title="Flight options"
                action={
                  <button
                    type="button"
                    onClick={() => addComponentOption('flightOptions', 'flight')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                    title="Add flight"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              />
              <div className="space-y-3">
                {payload.flightOptions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
                    No flight included. Use the plus button to add flight options.
                  </p>
                )}
                {payload.flightOptions.map((option, index) => (
                  <div key={option.id}>
                    <OptionEditor
                      option={option}
                      titlePlaceholder="Flight option"
                      summaryPlaceholder="Airline, route, connection time, baggage"
                      priceLabel="Flight cost"
                      showFlightPricing
                      showDefaultToggle
                      defaultLabel="Preferred flight"
                      canRemove
                      onChange={(next) => updateComponentOption('flightOptions', index, next)}
                      onRemove={() => removeComponentOption('flightOptions', index)}
                    />
                    <div className="mt-3 space-y-3">
                      {payload.linkedFlightGroups
                        .filter((group) => group.baseFlightOptionId === option.id)
                        .map((group) => (
                          <LinkedFlightGroupEditor
                            key={group.id}
                            group={group}
                            onChange={(next) => updateLinkedFlightGroup(group.id, next)}
                            onRemove={() => removeLinkedFlightGroup(group.id)}
                          />
                        ))}
                      <button
                        type="button"
                        onClick={() => addLinkedFlightGroup(option.id)}
                        className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-900 transition hover:bg-blue-100"
                      >
                        <Link2 className="h-4 w-4" />
                        Add linked flight leg
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
              <SectionHeader
                icon={FileText}
                title="Visa options"
                action={
                  <button
                    type="button"
                    onClick={() => addComponentOption('visaOptions', 'visa')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                    title="Add visa"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              />
              <div className="space-y-3">
                {payload.visaOptions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
                    No visa included. Use the plus button to add visa options.
                  </p>
                )}
                {payload.visaOptions.map((option, index) => (
                  <OptionEditor
                    key={option.id}
                    option={option}
                    titlePlaceholder="Visa option"
                    summaryPlaceholder="ETA, tourist visa, multiple entry, insurance notes"
                    priceLabel="Visa cost"
                    showPricingMode
                    showQuantity
                    quantityFallback={servicePassengerCount}
                    canRemove
                    onChange={(next) => updateComponentOption('visaOptions', index, next)}
                    onRemove={() => removeComponentOption('visaOptions', index)}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm lg:col-span-2">
              <SectionHeader
                icon={Bus}
                title="Transport options"
                action={
                  <button
                    type="button"
                    onClick={() => addComponentOption('transportOptions', 'transport')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                    title="Add transport"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                }
              />
              <div className="space-y-3">
                {payload.transportOptions.length === 0 && (
                  <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm font-semibold text-slate-500">
                    No transport included. Use the plus button to add transport options.
                  </p>
                )}
                {payload.transportOptions.map((option, index) => (
                  <OptionEditor
                    key={option.id}
                    option={option}
                    titlePlaceholder="Transport option"
                    summaryPlaceholder="Airport transfers, hotel transfers, ziyarat, vehicle type"
                    priceLabel="Transport cost"
                    showPricingMode
                    showDefaultToggle
                    defaultLabel="Preferred transport"
                    showTransportExtras
                    showTransportPriceList={payload.packageType !== 'holiday'}
                    transportPricingData={transportPricingData}
                    canRemove
                    onChange={(next) => updateComponentOption('transportOptions', index, next)}
                    onRemove={() => removeComponentOption('transportOptions', index)}
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 shadow-sm">
            <SectionHeader icon={Building2} title="Hotel and stay options" />
            <div className="grid gap-4 lg:grid-cols-2">
              {payload.stayGroups.map((group, groupIndex) => (
                <div key={group.id} className="rounded-lg border border-violet-200 bg-white p-3">
                  <div className="mb-3 flex items-center gap-2">
                    <input
                      value={group.label}
                      onChange={(event) =>
                        updateStayGroup(groupIndex, { ...group, label: event.target.value })
                      }
                      placeholder={payload.packageType === 'holiday' ? 'Enter location' : 'Stay'}
                      className="min-h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm font-black outline-none focus:border-slate-900"
                    />
                    {payload.packageType === 'holiday' && groupIndex === 0 && (
                      <span className="rounded-lg bg-blue-100 px-2 py-2 text-[11px] font-black text-blue-800">
                        Start
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        updateStayGroup(groupIndex, {
                          ...group,
                          options: [
                            ...group.options,
                            newOption(`${group.id}-hotel`, {
                              isDefault: group.options.length === 0,
                            }),
                          ],
                        })
                      }
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                      title="Add hotel"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    {group.options.map((option, optionIndex) => (
                      <OptionEditor
                        key={option.id}
                        option={option}
                        titlePlaceholder={`${group.label} hotel`}
                        summaryPlaceholder={`${group.label} hotel summary, nights, board basis, distance`}
                        showHotelCostAudit
                        showDefaultToggle
                        defaultLabel="Preferred hotel"
                        canRemove={group.options.length > 1}
                        onChange={(next) =>
                          updateStayGroup(groupIndex, {
                            ...group,
                            options: next.isDefault
                              ? group.options.map((candidate, index) => ({
                                  ...(index === optionIndex ? next : candidate),
                                  isDefault: index === optionIndex,
                                }))
                              : group.options.map((candidate, index) =>
                                  index === optionIndex ? next : candidate,
                                ),
                          })
                        }
                        onRemove={() =>
                          updateStayGroup(groupIndex, {
                            ...group,
                            options: group.options.filter((_, index) => index !== optionIndex),
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-orange-200 bg-orange-50/40 p-4 shadow-sm">
            <SectionHeader
              icon={Tag}
              title="Limited time offers"
              action={
                <button
                  type="button"
                  onClick={addLimitedTimeOffer}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                  title="Add offer"
                >
                  <Plus className="h-4 w-4" />
                </button>
              }
            />
            {payload.limitedTimeOffers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">
                No limited-time offer added. Use the plus button to add an early bird or deadline
                discount.
              </p>
            ) : (
              <div className="space-y-3">
                {payload.limitedTimeOffers.map((offer, index) => (
                  <div
                    key={offer.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <input
                        value={offer.title}
                        onChange={(event) =>
                          updateLimitedTimeOffer(index, { ...offer, title: event.target.value })
                        }
                        placeholder="Offer title"
                        className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          updateLimitedTimeOffer(index, { ...offer, active: !offer.active })
                        }
                        className={`min-h-10 rounded-lg px-3 text-xs font-black transition ${
                          offer.active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {offer.active ? 'Active' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLimitedTimeOffer(index)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-100 bg-white text-red-600 transition hover:bg-red-50"
                        title="Remove offer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">
                          Deadline
                        </span>
                        <input
                          type="datetime-local"
                          value={offer.expiresAt ? toDateTimeLocalValue(offer.expiresAt) : ''}
                          onChange={(event) =>
                            updateLimitedTimeOffer(index, {
                              ...offer,
                              expiresAt: event.target.value
                                ? fromDateTimeLocalValue(event.target.value)
                                : '',
                            })
                          }
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">
                          Discount
                        </span>
                        <div className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3">
                          <span className="mr-2 text-sm font-black text-slate-500">GBP</span>
                          <input
                            value={offer.discountAmount || ''}
                            onChange={(event) =>
                              updateLimitedTimeOffer(index, {
                                ...offer,
                                discountAmount: Number(event.target.value || 0),
                              })
                            }
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="w-full bg-transparent text-sm font-bold outline-none"
                          />
                        </div>
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-bold text-slate-500">Mode</span>
                        <select
                          value={offer.discountMode}
                          onChange={(event) =>
                            updateLimitedTimeOffer(index, {
                              ...offer,
                              discountMode: event.target
                                .value as PackageLimitedTimeOffer['discountMode'],
                            })
                          }
                          className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
                        >
                          <option value="total">Total</option>
                          <option value="per_person">Per person</option>
                        </select>
                      </label>
                    </div>
                    <textarea
                      value={offer.summary}
                      onChange={(event) =>
                        updateLimitedTimeOffer(index, { ...offer, summary: event.target.value })
                      }
                      placeholder="Public offer wording"
                      rows={3}
                      className="mt-3 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-slate-900"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader
              icon={Calculator}
              title="Generated options"
              action={
                <button
                  type="button"
                  onClick={() => void copyAllOptions()}
                  disabled={customerOptions.length === 0}
                  className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-40"
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </button>
              }
            />
            {customerOptions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Add at least one priced hotel option in each stay group and one paying guest to
                generate totals.
              </div>
            ) : (
              <div className="max-h-[44rem] space-y-3 overflow-y-auto pr-1">
                {baseCustomerOption && (
                  <div className="rounded-lg border border-[#8b1e2d]/20 bg-red-50 p-3 text-xs text-slate-700">
                    <p className="text-sm font-black text-slate-950">Base package</p>
                    <p className="mt-1">
                      {baseCustomerOption.flightOption?.title || 'No flight'} ·{' '}
                      {baseCustomerOption.transportOption?.title || 'No transport'} ·{' '}
                      {baseCustomerOption.visaOptions.length > 0 ? 'Visa included' : 'No visa'}
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {formatMoney(baseCustomerOption.totalPrice, baseCustomerOption.currency)}
                    </p>
                  </div>
                )}
                {customerOptions.slice(0, 30).map(({ combination }, index) => {
                  const delta = baseCustomerOption
                    ? combination.totalPrice - baseCustomerOption.totalPrice
                    : 0
                  const perPersonDelta = payingGuestCount > 0 ? delta / payingGuestCount : delta
                  return (
                    <div key={combination.id} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black text-slate-950">Option {index + 1}</p>
                          <p className="text-xs text-slate-500">
                            {index === 0
                              ? 'Included base hotel combination'
                              : `${perPersonDelta >= 0 ? '+' : '-'}${formatMoney(
                                  Math.abs(perPersonDelta),
                                  combination.currency,
                                )} pp`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-black text-slate-950">
                            {formatMoney(combination.totalPrice, combination.currency)}
                          </p>
                          {combination.offerDiscountTotal > 0 && (
                            <p className="text-[11px] font-bold text-emerald-700">
                              {formatMoney(combination.offerDiscountTotal, combination.currency)}{' '}
                              off
                            </p>
                          )}
                          <p className="text-xs font-bold text-[#8b1e2d]">
                            {formatMoney(combination.perPersonPrice, combination.currency)} avg
                            hotel payer
                          </p>
                        </div>
                      </div>
                      <div className="space-y-1 text-xs text-slate-600">
                        {getOrderedStaySelections(payload, combination).map((stay) => (
                          <p key={`${combination.id}-${stay.groupId}`}>
                            <span className="font-bold text-slate-800">{stay.groupLabel}:</span>{' '}
                            {stay.option.title || 'Hotel option'}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <SectionHeader icon={PackageCheck} title="Recent quotes" />
            {loading ? (
              <p className="text-sm text-slate-500">Loading quotes...</p>
            ) : quotes.length === 0 ? (
              <p className="text-sm text-slate-500">No saved package quotes yet.</p>
            ) : (
              <div className="space-y-2">
                {quotes.slice(0, 12).map((quote) => (
                  <button
                    key={quote.id}
                    type="button"
                    onClick={() => openQuoteForEdit(quote)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      activeQuote?.id === quote.id
                        ? 'border-[#8b1e2d] bg-red-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black text-slate-950">{quote.title}</p>
                        <p className="text-xs text-slate-500">
                          {quote.package_type} ·{' '}
                          {new Date(quote.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <span className="rounded bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                        {quote.status}
                      </span>
                    </div>
                    {quote.selected_at && (
                      <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                        Customer selected an option
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
            {activeQuote && (
              <button
                type="button"
                onClick={() => void archiveQuote()}
                disabled={saving}
                className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-red-200 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Archive Current Quote
              </button>
            )}
            <p className="mt-3 text-xs text-slate-400">Current user: {currentUserId.slice(0, 8)}</p>
          </section>
        </aside>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SectionHeader icon={PackageCheck} title="Package quote table" />
          <div className="flex flex-wrap gap-2">
            {QUOTE_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setQuoteFilter(filter.value)}
                className={`min-h-9 rounded-lg px-3 text-xs font-black transition ${
                  quoteFilter === filter.value
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Loading package quotes...</p>
        ) : filteredQuotes.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            No package quotes match this view.
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[900px] w-full border-separate border-spacing-0 text-left text-sm">
              <thead>
                <tr className="text-xs font-black uppercase text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2">Quote</th>
                  <th className="border-b border-slate-200 px-3 py-2">Customer</th>
                  <th className="border-b border-slate-200 px-3 py-2">Status</th>
                  <th className="border-b border-slate-200 px-3 py-2">Expires</th>
                  <th className="border-b border-slate-200 px-3 py-2">From</th>
                  <th className="border-b border-slate-200 px-3 py-2">Selection</th>
                  <th className="border-b border-slate-200 px-3 py-2">Live Link</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuotes.map((quote) => {
                  const startingPrice = getQuoteStartingPrice(quote)
                  const expired = isPackageQuoteExpired(quote.expires_at)
                  const live = quote.share_enabled && quote.status === 'shared' && !expired
                  const quoteShareUrl = buildShareUrl(quote.share_token)

                  return (
                    <tr
                      key={quote.id}
                      className={`align-top ${
                        activeQuote?.id === quote.id ? 'bg-red-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="max-w-[16rem] truncate font-black text-slate-950">
                          {quote.title}
                        </p>
                        <p className="text-xs text-slate-500">
                          {quote.package_type} ·{' '}
                          {new Date(quote.created_at).toLocaleDateString('en-GB')}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p className="font-bold text-slate-800">
                          {quote.customer_name || 'No customer'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {quote.customer_phone || quote.customer_email || ''}
                        </p>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <span
                          className={`inline-flex rounded-lg px-2 py-1 text-xs font-black ${
                            expired
                              ? 'bg-red-50 text-red-700'
                              : live
                                ? 'bg-emerald-50 text-emerald-700'
                                : quote.status === 'draft'
                                  ? 'bg-amber-50 text-amber-700'
                                  : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {expired ? 'Expired' : live ? 'Live' : quote.status}
                        </span>
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <p
                          className={`text-xs font-bold ${expired ? 'text-red-700' : 'text-slate-700'}`}
                        >
                          {formatExpiry(quote.expires_at)}
                        </p>
                        {quote.share_enabled && (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {expired ? 'Link closed' : 'Link open'}
                          </p>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {startingPrice ? (
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(startingPrice.totalPrice, startingPrice.currency)}
                            </p>
                            <p className="text-xs font-bold text-[#8b1e2d]">
                              {formatMoney(startingPrice.perPersonPrice, startingPrice.currency)}{' '}
                              avg hotel payer
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Incomplete</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {quote.selected_at ? (
                          <div>
                            <p className="text-xs font-black text-emerald-700">Selected</p>
                            <p className="text-xs text-slate-500">
                              {new Date(quote.selected_at).toLocaleString('en-GB')}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">No reply yet</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        {live ? (
                          <p className="max-w-[16rem] truncate text-xs font-semibold text-slate-600">
                            {quoteShareUrl}
                          </p>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">Not shared</span>
                        )}
                      </td>
                      <td className="border-b border-slate-100 px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openQuoteForEdit(quote)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100"
                            title="Open quote for editing"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateQuote(quote)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-900 transition hover:bg-blue-100"
                            title="Duplicate quote as new draft"
                          >
                            <CopyPlus className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyQuoteShareLink(quote)}
                            disabled={!live}
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                            title="Copy customer link"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          {live ? (
                            <a
                              href={quoteShareUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white transition hover:bg-black"
                              title="Open customer link"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          ) : (
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-300">
                              <ExternalLink className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
