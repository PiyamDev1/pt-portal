'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Link2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import type {
  PackageComponentOption,
  PackageLinkedFlightGroup,
  PackageLinkedFlightOption,
  PackageTransportRouteKind,
  PackageTransportRouteSelection,
  PackageVisaPassengerCategory,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import {
  buildTransportSummary,
  convertTransportCostToGbp,
  findDefaultTransportSelection,
  getGroupedRouteOptions,
  getMajoritySupplier,
  getPricedRouteOptions,
  getRouteKind,
  getTransportRouteBullets,
  getTransportRouteBulletText,
  getTransportRouteNetCostForSupplier,
  makeId,
  resolveTransportRouteSelection,
  restoreTransportRoutesFromSummary,
  type UmrahTransportPricingData,
} from './packageTransportPricingModel'

const FLIGHT_COST_FIELDS = [
  {
    label: 'Adult Search Cost',
    costKey: 'adultSearchCost',
    searchKey: 'adultSearchCost',
    priceKey: 'adultPrice',
    adjusted: false,
  },
  {
    label: 'Adult Adj Cost',
    costKey: 'adultAdjustedCost',
    searchKey: 'adultSearchCost',
    priceKey: 'adultPrice',
    adjusted: true,
  },
  {
    label: 'Child Search Cost',
    costKey: 'childSearchCost',
    searchKey: 'childSearchCost',
    priceKey: 'childPrice',
    adjusted: false,
  },
  {
    label: 'Child Adj Cost',
    costKey: 'childAdjustedCost',
    searchKey: 'childSearchCost',
    priceKey: 'childPrice',
    adjusted: true,
  },
  {
    label: 'Infant Search Cost',
    costKey: 'infantSearchCost',
    searchKey: 'infantSearchCost',
    priceKey: 'infantPrice',
    adjusted: false,
  },
  {
    label: 'Infant Adj Cost',
    costKey: 'infantAdjustedCost',
    searchKey: 'infantSearchCost',
    priceKey: 'infantPrice',
    adjusted: true,
  },
] as const

function newHotelAddonOption() {
  return {
    id: makeId('hotel-addon'),
    label: '',
    searchPrice: 0,
    adjustedPrice: 0,
    price: 0,
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

export function newLinkedFlightGroup(baseFlightOptionId: string): PackageLinkedFlightGroup {
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

function LinkedFlightGroupEditor({
  group,
  legNumber,
  flightOptionNumber,
  onChange,
  onRemove,
}: {
  group: PackageLinkedFlightGroup
  legNumber: number
  flightOptionNumber: number
  onChange: (next: PackageLinkedFlightGroup) => void
  onRemove: () => void
}) {
  const [expanded, setExpanded] = useState(true)
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

  const includedOption =
    group.options.find((option) => option.id === group.defaultOptionId) ||
    group.options.find((option) => option.isDefault) ||
    group.options[0]
  const orderedOptions = [
    ...(includedOption
      ? [
          {
            option: includedOption,
            optionIndex: group.options.findIndex((option) => option.id === includedOption.id),
            isIncluded: true,
            alternativeNumber: 0,
          },
        ]
      : []),
    ...group.options
      .filter((option) => option.id !== includedOption?.id)
      .map((option, alternativeIndex) => ({
        option,
        optionIndex: group.options.findIndex((candidate) => candidate.id === option.id),
        isIncluded: false,
        alternativeNumber: alternativeIndex + 1,
      })),
  ]

  return (
    <div className="rounded-lg border-2 border-indigo-400 bg-indigo-50 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b-2 border-indigo-200 bg-indigo-100/80 p-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={expanded}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-900 text-sm font-black text-white">
            {legNumber + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-black uppercase text-indigo-900">
              Linked journey leg {legNumber}
            </span>
            <span className="mt-0.5 block text-xs font-bold text-indigo-700">
              Belongs to Flight Option {flightOptionNumber}
            </span>
            <span className="mt-1 block truncate text-sm font-black text-slate-950">
              {group.routeLabel || 'Route not entered'}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-indigo-300 bg-white text-indigo-900 transition hover:bg-indigo-50"
            title={expanded ? 'Collapse linked journey leg' : 'Expand linked journey leg'}
            aria-label={expanded ? 'Collapse linked journey leg' : 'Expand linked journey leg'}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-red-200 bg-white text-red-600 transition hover:bg-red-50"
            title="Remove linked journey leg"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3">
          <label className="block">
            <span className="block text-xs font-black uppercase text-indigo-900">
              Journey route
            </span>
            <input
              value={group.routeLabel}
              onChange={(event) => onChange({ ...group, routeLabel: event.target.value })}
              placeholder="Madinah to London"
              className="mt-1 min-h-10 w-full rounded-lg border-2 border-indigo-200 bg-white px-3 text-sm font-bold outline-none focus:border-indigo-700"
            />
          </label>

          <div className="mt-3 space-y-3">
            {orderedOptions.map(({ option, optionIndex, isIncluded, alternativeNumber }) => (
              <div
                key={option.id}
                className={`rounded-lg border-2 p-3 ${
                  isIncluded ? 'border-emerald-400 bg-emerald-50' : 'border-slate-300 bg-white'
                }`}
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={`text-xs font-black uppercase ${
                      isIncluded ? 'text-emerald-800' : 'text-slate-600'
                    }`}
                  >
                    {isIncluded ? 'Included flight' : `Alternative flight ${alternativeNumber}`}
                  </p>
                  {isIncluded && (
                    <span className="rounded-md bg-emerald-700 px-2 py-1 text-[10px] font-black uppercase text-white">
                      Included
                    </span>
                  )}
                </div>
                <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
                  <input
                    value={option.airlineName}
                    onChange={(event) =>
                      updateOption(optionIndex, { ...option, airlineName: event.target.value })
                    }
                    placeholder="Airline"
                    className="min-h-10 min-w-0 flex-1 rounded-lg border-2 border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-indigo-700"
                  />
                  {!isIncluded && (
                    <button
                      type="button"
                      onClick={() =>
                        updateOption(optionIndex, {
                          ...option,
                          isDefault: true,
                        })
                      }
                      className="min-h-10 w-full rounded-lg border-2 border-emerald-300 bg-white px-3 text-xs font-black text-emerald-800 transition hover:bg-emerald-50 sm:w-auto"
                    >
                      Set as included
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeOption(option.id)}
                    disabled={group.options.length <= 1}
                    className="flex h-10 w-10 shrink-0 items-center justify-center justify-self-end rounded-lg border-2 border-red-100 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30"
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
                  className="w-full resize-y rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-700"
                />
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  {FLIGHT_COST_FIELDS.map((field) => (
                    <label key={field.costKey} className="block min-w-0">
                      <span className="block min-h-7 text-[11px] font-semibold leading-tight text-slate-500">
                        {field.label}
                      </span>
                      <div className="mt-1 flex min-h-9 items-center rounded-lg border-2 border-slate-200 bg-white px-2">
                        <input
                          aria-label={field.label}
                          value={option[field.costKey] ?? option[field.priceKey] ?? ''}
                          onChange={(event) => {
                            const amount = Number(event.target.value || 0)
                            updateOption(optionIndex, {
                              ...option,
                              [field.costKey]: amount,
                              ...(field.adjusted
                                ? {
                                    [field.searchKey]:
                                      option[field.searchKey] ?? option[field.priceKey] ?? 0,
                                    [field.priceKey]: amount,
                                  }
                                : {}),
                            })
                          }}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          className="min-w-0 w-full bg-transparent text-sm font-bold outline-none"
                        />
                      </div>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs font-semibold text-indigo-900">
                  Quote totals use Adj Cost. Customers see only the difference from the included
                  airline for this leg.
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border-2 border-indigo-300 bg-white px-3 text-xs font-black text-indigo-900 transition hover:bg-indigo-100"
          >
            <Plus className="h-4 w-4" />
            Add alternative airline
          </button>
        </div>
      )}
    </div>
  )
}

export function FlightOptionEditor({
  option,
  optionIndex,
  linkedGroups,
  onChange,
  onRemove,
  onAddLinkedGroup,
  onChangeLinkedGroup,
  onRemoveLinkedGroup,
}: {
  option: PackageComponentOption
  optionIndex: number
  linkedGroups: PackageLinkedFlightGroup[]
  onChange: (next: PackageComponentOption) => void
  onRemove: () => void
  onAddLinkedGroup: () => void
  onChangeLinkedGroup: (groupId: string, next: PackageLinkedFlightGroup) => void
  onRemoveLinkedGroup: (groupId: string) => void
}) {
  const [expanded, setExpanded] = useState(option.isDefault || !option.title.trim())
  const getMainPrice = (key: 'adultPrice' | 'childPrice' | 'infantPrice') =>
    option[key] || (option.pricingMode === 'per_person' ? option.price || 0 : 0)
  const getLinkedPrice = (key: 'adultPrice' | 'childPrice' | 'infantPrice') =>
    linkedGroups.reduce((total, group) => {
      const includedOption =
        group.options.find((candidate) => candidate.id === group.defaultOptionId) ||
        group.options.find((candidate) => candidate.isDefault) ||
        group.options[0]
      return total + (includedOption?.[key] || 0)
    }, 0)
  const arrangementPrices = {
    adult: getMainPrice('adultPrice') + getLinkedPrice('adultPrice'),
    child: getMainPrice('childPrice') + getLinkedPrice('childPrice'),
    infant: getMainPrice('infantPrice') + getLinkedPrice('infantPrice'),
  }
  const hasArrangementPrices = Object.values(arrangementPrices).some((price) => price !== 0)

  return (
    <div className="overflow-hidden rounded-lg border-2 border-sky-500 bg-white shadow-md">
      <div className="flex items-start justify-between gap-3 border-b-2 border-sky-300 bg-sky-100 p-3">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={expanded}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-900 text-sm font-black text-white">
            {optionIndex + 1}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-black uppercase text-sky-900">
                Flight Option {optionIndex + 1}
              </span>
              {option.isDefault && (
                <span className="rounded-md bg-emerald-700 px-2 py-1 text-[10px] font-black uppercase text-white">
                  Preferred
                </span>
              )}
            </span>
            <span className="mt-1 block truncate text-base font-black text-slate-950">
              {option.title || 'Untitled flight arrangement'}
            </span>
            <span className="mt-1 block text-xs font-bold text-sky-800">
              {linkedGroups.length === 0
                ? 'Main flight only'
                : `Main flight + ${linkedGroups.length} linked journey ${
                    linkedGroups.length === 1 ? 'leg' : 'legs'
                  }`}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {hasArrangementPrices && (
            <div className="hidden text-right xl:block">
              <p className="text-[10px] font-black uppercase text-sky-800">Included arrangement</p>
              <p className="mt-0.5 text-xs font-black text-slate-950">
                Adult {formatMoney(arrangementPrices.adult, 'GBP')} · Child{' '}
                {formatMoney(arrangementPrices.child, 'GBP')} · Infant{' '}
                {formatMoney(arrangementPrices.infant, 'GBP')}
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-sky-300 bg-white text-sky-900 transition hover:bg-sky-50"
            title={expanded ? 'Collapse flight option' : 'Expand flight option'}
            aria-label={expanded ? 'Collapse flight option' : 'Expand flight option'}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-3">
          <div className="rounded-lg border-2 border-sky-300 bg-sky-50/70 p-3">
            <div className="mb-2 flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-900 text-sm font-black text-white">
                1
              </span>
              <div>
                <p className="text-xs font-black uppercase text-sky-900">Main flight</p>
                <p className="text-xs font-bold text-sky-700">
                  Starting flight for Flight Option {optionIndex + 1}
                </p>
              </div>
            </div>
            <OptionEditor
              option={option}
              titlePlaceholder="Flight option"
              summaryPlaceholder="Airline, route, connection time, baggage"
              priceLabel="Flight cost"
              showFlightPricing
              showDefaultToggle
              defaultLabel="Preferred flight"
              canRemove
              containerClassName="rounded-lg border-2 border-sky-200 bg-white p-3"
              onChange={onChange}
              onRemove={onRemove}
            />
          </div>

          <div className="ml-4 mt-3 space-y-3 border-l-4 border-indigo-300 pl-4">
            {linkedGroups.map((group, linkedIndex) => (
              <LinkedFlightGroupEditor
                key={group.id}
                group={group}
                legNumber={linkedIndex + 1}
                flightOptionNumber={optionIndex + 1}
                onChange={(next) => onChangeLinkedGroup(group.id, next)}
                onRemove={() => onRemoveLinkedGroup(group.id)}
              />
            ))}
            <button
              type="button"
              onClick={onAddLinkedGroup}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border-2 border-indigo-300 bg-indigo-50 px-3 text-xs font-black text-indigo-900 transition hover:bg-indigo-100"
            >
              <Link2 className="h-4 w-4" />
              Add another journey leg
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function OptionEditor({
  option,
  onChange,
  onRemove,
  titlePlaceholder,
  fallbackTitle = '',
  summaryPlaceholder,
  priceLabel = 'Total price',
  showPricingMode = false,
  showFlightPricing = false,
  showHotelCostAudit = false,
  showDefaultToggle = false,
  defaultLabel = 'Preferred option',
  showQuantity = false,
  showVisaPassengerCategory = false,
  showTransportExtras = false,
  showTransportPriceList = true,
  transportPricingData = null,
  quantityFallback,
  canRemove,
  containerClassName = 'rounded-lg border border-slate-200 bg-white p-3 shadow-sm',
}: {
  option: PackageComponentOption
  onChange: (next: PackageComponentOption) => void
  onRemove: () => void
  titlePlaceholder: string
  fallbackTitle?: string
  summaryPlaceholder: string
  priceLabel?: string
  showPricingMode?: boolean
  showFlightPricing?: boolean
  showHotelCostAudit?: boolean
  showDefaultToggle?: boolean
  defaultLabel?: string
  showQuantity?: boolean
  showVisaPassengerCategory?: boolean
  showTransportExtras?: boolean
  showTransportPriceList?: boolean
  transportPricingData?: UmrahTransportPricingData | null
  quantityFallback?: number
  canRemove: boolean
  containerClassName?: string
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
  const hotelAddonOptions = option.hotelAddonOptions || []

  const updateHotelAddonOption = (
    addonIndex: number,
    changes: Partial<NonNullable<PackageComponentOption['hotelAddonOptions']>[number]>,
  ) => {
    onChange({
      ...option,
      hotelAddonOptions: hotelAddonOptions.map((addon, index) =>
        index === addonIndex
          ? {
              ...addon,
              ...changes,
              price:
                Object.prototype.hasOwnProperty.call(changes, 'adjustedPrice') &&
                changes.adjustedPrice !== undefined
                  ? changes.adjustedPrice
                  : addon.price,
            }
          : addon,
      ),
    })
  }

  const removeHotelAddonOption = (addonIndex: number) => {
    onChange({
      ...option,
      hotelAddonOptions: hotelAddonOptions.filter((_, index) => index !== addonIndex),
    })
  }

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
        title: option.title || fallbackTitle,
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
    [fallbackTitle, onChange, option, transportPricingData],
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
    <div className={containerClassName}>
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
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          <label className="block">
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
          {showVisaPassengerCategory && (
            <label className="block">
              <span className="block text-xs font-bold text-slate-500">Visa applies to</span>
              <select
                value={option.visaPassengerCategory || 'all'}
                onChange={(event) =>
                  onChange({
                    ...option,
                    visaPassengerCategory: event.target.value as PackageVisaPassengerCategory,
                  })
                }
                className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
              >
                <option value="all">All travellers</option>
                <option value="adult">Adult 12+</option>
                <option value="child_5_plus">Child 5+</option>
                <option value="child_2_to_4">Child 2-4</option>
                <option value="infant">Infant under 2</option>
              </select>
            </label>
          )}
        </div>
      )}
      <textarea
        value={option.summary}
        onChange={(event) => onChange({ ...option, summary: event.target.value })}
        placeholder={summaryPlaceholder}
        rows={3}
        className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900"
      />
      {showFlightPricing ? (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {FLIGHT_COST_FIELDS.map((field) => (
            <label key={field.costKey} className="block min-w-0">
              <span className="block min-h-7 text-[11px] font-semibold leading-tight text-slate-500">
                {field.label}
              </span>
              <div className="mt-1 flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-2">
                <input
                  aria-label={field.label}
                  value={option[field.costKey] ?? option[field.priceKey] ?? ''}
                  onChange={(event) => {
                    const amount = Number(event.target.value || 0)
                    onChange({
                      ...option,
                      [field.costKey]: amount,
                      ...(field.adjusted
                        ? {
                            [field.searchKey]:
                              option[field.searchKey] ?? option[field.priceKey] ?? 0,
                            [field.priceKey]: amount,
                          }
                        : {}),
                      pricingMode: 'per_person',
                    })
                  }}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="min-w-0 w-full bg-transparent text-sm font-bold outline-none"
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
              : showPricingMode
                ? 'grid-cols-1'
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
      {showHotelCostAudit && (
        <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase text-violet-900">Customer hotel extras</p>
              <p className="text-xs font-semibold text-slate-500">
                Add breakfast, view, or any selectable hotel extra.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...option,
                  hotelAddonOptions: [...hotelAddonOptions, newHotelAddonOption()],
                })
              }
              className="min-h-8 rounded-lg bg-violet-900 px-3 text-xs font-black text-white transition hover:bg-violet-950"
            >
              Add extra
            </button>
          </div>
          {hotelAddonOptions.length > 0 && (
            <div className="mt-3 space-y-2">
              {hotelAddonOptions.map((addon, addonIndex) => (
                <div key={addon.id} className="rounded-lg border border-violet-100 bg-white p-2">
                  <label className="block min-w-0">
                    <span className="block text-[10px] font-black uppercase text-slate-500">
                      Option
                    </span>
                    <input
                      value={addon.label}
                      onChange={(event) =>
                        updateHotelAddonOption(addonIndex, { label: event.target.value })
                      }
                      placeholder="Breakfast, Kaaba view, city view"
                      className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-violet-800"
                    />
                  </label>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                    <label className="block min-w-0">
                      <span className="block text-[10px] font-black uppercase text-slate-500">
                        Search cost
                      </span>
                      <div className="mt-1 flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-2">
                        <span className="mr-1 shrink-0 text-xs font-black text-slate-500">GBP</span>
                        <input
                          value={addon.searchPrice || ''}
                          onChange={(event) =>
                            updateHotelAddonOption(addonIndex, {
                              searchPrice: Number(event.target.value || 0),
                            })
                          }
                          type="number"
                          step="0.01"
                          placeholder="+/- 0.00"
                          className="min-w-0 w-full bg-transparent text-sm font-bold outline-none"
                        />
                      </div>
                    </label>
                    <label className="block min-w-0">
                      <span className="block text-[10px] font-black uppercase text-slate-500">
                        Adjustment cost
                      </span>
                      <div className="mt-1 flex min-h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-2">
                        <span className="mr-1 shrink-0 text-xs font-black text-slate-500">GBP</span>
                        <input
                          value={addon.adjustedPrice || ''}
                          onChange={(event) =>
                            updateHotelAddonOption(addonIndex, {
                              adjustedPrice: Number(event.target.value || 0),
                            })
                          }
                          type="number"
                          step="0.01"
                          placeholder="+/- 0.00"
                          className="min-w-0 w-full bg-transparent text-sm font-bold outline-none"
                        />
                      </div>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeHotelAddonOption(addonIndex)}
                      className="flex h-10 w-10 items-center justify-center self-end rounded-lg border border-red-100 text-red-600 transition hover:bg-red-50"
                      title="Remove extra"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
