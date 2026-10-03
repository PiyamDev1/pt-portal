'use client'

import { Fragment, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'

import type {
  UmrahTransportRoute,
  UmrahTransportRoutePlan,
  UmrahTransportRoutePlanSegment,
  UmrahTransportSupplier,
  UmrahTransportVehicleType,
} from '@/app/types/pricing'
import {
  formatAmount,
  GUIDE_SERVICES,
  guideKey,
  normaliseLabel,
  parseAmount,
  rateKey,
  supplierVehicleLabelKey,
  type GuideDrafts,
  type PlanDraft,
  type RateDrafts,
  type SupplierDraft,
  type SupplierVehicleLabelDrafts,
  type VehicleDraft,
} from './umrahTransportPricingModel'

const SUPPLIER_DIVIDER_CLASSES = [
  'bg-red-900',
  'bg-emerald-600',
  'bg-amber-500',
  'bg-sky-600',
  'bg-purple-600',
  'bg-slate-500',
] as const

function getRouteTotal(
  rateDrafts: RateDrafts,
  segments: UmrahTransportRoutePlanSegment[],
  supplierId: string,
  vehicleTypeId: string,
) {
  return segments.reduce((total, segment) => {
    return total + parseAmount(rateDrafts[rateKey(segment.route_id, supplierId, vehicleTypeId)])
  }, 0)
}

function getRouteAmount(
  rateDrafts: RateDrafts,
  routeId: string | undefined,
  supplierId: string,
  vehicleTypeId: string,
) {
  if (!routeId) return 0
  return parseAmount(rateDrafts[rateKey(routeId, supplierId, vehicleTypeId)])
}

export interface UmrahTransportPricingRatesModel {
  plans: UmrahTransportRoutePlan[]
  segmentsByPlanId: Map<string, UmrahTransportRoutePlanSegment[]>
  routes: UmrahTransportRoute[]
  routeUsageCountById: Map<string, number>
  suppliers: UmrahTransportSupplier[]
  supplierDrafts: Record<string, SupplierDraft>
  vehicles: UmrahTransportVehicleType[]
  vehicleDrafts: Record<string, VehicleDraft>
  planDrafts: Record<string, PlanDraft>
  rateDrafts: RateDrafts
  guideDrafts: GuideDrafts
  supplierVehicleLabelDrafts: SupplierVehicleLabelDrafts
  onUpdatePlan: (planId: string, changes: Partial<PlanDraft>) => void
  onUpdateVehicle: (vehicleTypeId: string, changes: Partial<VehicleDraft>) => void
  onUpdateRate: (
    routeId: string | undefined,
    supplierId: string,
    vehicleTypeId: string,
    value: string,
  ) => void
  onUpdateGuide: (supplierId: string, guideService: string, value: string) => void
  onUpdateSupplierVehicleLabel: (supplierId: string, vehicleTypeId: string, value: string) => void
}

export function UmrahTransportPricingRatesPanel({
  model,
}: {
  model: UmrahTransportPricingRatesModel
}) {
  const [collapsedPlanIds, setCollapsedPlanIds] = useState<Set<string>>(new Set())

  const routeById = useMemo(
    () => new Map(model.routes.map((route) => [route.id, route])),
    [model.routes],
  )

  const makkahZiyaratRoute = useMemo(() => {
    return (
      model.routes.find((route) => normaliseLabel(route.route_name) === 'makkah ziyarat') ||
      model.routes.find((route) => {
        const label = normaliseLabel(route.route_name)
        return label.includes('makkah') && (label.includes('ziyarat') || label.includes('mazarat'))
      }) ||
      null
    )
  }, [model.routes])

  const madinahZiyaratRoute = useMemo(() => {
    return (
      model.routes.find((route) => normaliseLabel(route.route_name) === 'madinah ziyarat') ||
      model.routes.find((route) => {
        const label = normaliseLabel(route.route_name)
        return (
          (label.includes('madinah') || label.includes('madina')) &&
          (label.includes('ziyarat') || label.includes('mazarat'))
        )
      }) ||
      null
    )
  }, [model.routes])

  const getSupplierCurrency = (supplierId: string) => {
    return model.supplierDrafts[supplierId]?.default_currency || 'SAR'
  }

  const cheapestTotalByPlanVehicle = useMemo(() => {
    const result = new Map<string, number>()
    model.plans.forEach((plan) => {
      const segments = model.segmentsByPlanId.get(plan.id) || []
      model.vehicles.forEach((vehicleType) => {
        const totals = model.suppliers
          .map((supplier) => getRouteTotal(model.rateDrafts, segments, supplier.id, vehicleType.id))
          .filter((amount) => amount > 0)
        if (totals.length > 0) {
          result.set(`${plan.id}:${vehicleType.id}`, Math.min(...totals))
        }
      })
    })
    return result
  }, [model.plans, model.rateDrafts, model.segmentsByPlanId, model.suppliers, model.vehicles])

  const cheapestZiyaratByRouteVehicle = useMemo(() => {
    const result = new Map<string, number>()
    const routeIds = [makkahZiyaratRoute?.id, madinahZiyaratRoute?.id].filter(
      (routeId): routeId is string => Boolean(routeId),
    )
    routeIds.forEach((routeId) => {
      model.vehicles.forEach((vehicleType) => {
        const amounts = model.suppliers
          .map((supplier) => getRouteAmount(model.rateDrafts, routeId, supplier.id, vehicleType.id))
          .filter((amount) => amount > 0)
        if (amounts.length > 0) {
          result.set(`${routeId}:${vehicleType.id}`, Math.min(...amounts))
        }
      })
    })
    return result
  }, [
    madinahZiyaratRoute?.id,
    makkahZiyaratRoute?.id,
    model.rateDrafts,
    model.suppliers,
    model.vehicles,
  ])

  const togglePlanCollapse = (planId: string) => {
    setCollapsedPlanIds((current) => {
      const next = new Set(current)
      if (next.has(planId)) next.delete(planId)
      else next.add(planId)
      return next
    })
  }

  const renderRateInput = (
    routeId: string | undefined,
    routeLabel: string,
    supplier: UmrahTransportSupplier,
    supplierName: string,
    vehicleType: UmrahTransportVehicleType,
    disabled = false,
  ) => {
    const key = routeId ? rateKey(routeId, supplier.id, vehicleType.id) : ''
    const value = key ? model.rateDrafts[key] || '' : ''
    const vehicleLabel = model.vehicleDrafts[vehicleType.id]?.label || vehicleType.label
    return (
      <div className="flex min-h-8 items-center gap-0.5">
        <span className="w-7 text-[10px] font-black text-slate-500">
          {getSupplierCurrency(supplier.id)}
        </span>
        <input
          aria-label={`${supplierName} ${vehicleLabel} ${routeLabel} cost`}
          value={value}
          inputMode="decimal"
          onChange={(event) =>
            model.onUpdateRate(routeId, supplier.id, vehicleType.id, event.target.value)
          }
          disabled={disabled || !routeId}
          className="h-7 w-14 rounded-none border-0 bg-transparent px-1 text-right text-[11px] font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-red-900/30 disabled:text-slate-300"
          placeholder="-"
        />
      </div>
    )
  }

  if (model.plans.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
        No Umrah route plans configured yet.
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {model.plans.map((plan) => {
        const segments = model.segmentsByPlanId.get(plan.id) || []
        const draft = model.planDrafts[plan.id]
        const fixedSupplierId = draft?.preferred_supplier_id || ''
        const tableColumnCount = segments.length + 9
        const isCollapsed = collapsedPlanIds.has(plan.id)
        return (
          <section
            key={plan.id}
            className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"
          >
            <div className="flex items-center gap-2 border-b border-slate-950 bg-slate-950 px-3 py-2">
              <button
                type="button"
                onClick={() => togglePlanCollapse(plan.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white transition hover:bg-white/10"
                title={isCollapsed ? 'Expand route table' : 'Collapse route table'}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              <input
                aria-label={`${plan.plan_name} plan name`}
                value={draft?.plan_name || ''}
                onChange={(event) => model.onUpdatePlan(plan.id, { plan_name: event.target.value })}
                className="w-full bg-transparent text-center text-sm font-black uppercase tracking-wide text-white outline-none"
              />
            </div>
            {!isCollapsed && (
              <>
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
                  <label className="flex flex-wrap items-center gap-2 text-xs font-black uppercase text-slate-500">
                    Fixed supplier
                    <select
                      value={fixedSupplierId}
                      onChange={(event) =>
                        model.onUpdatePlan(plan.id, {
                          preferred_supplier_id: event.target.value,
                        })
                      }
                      className="min-h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-black normal-case text-slate-900 outline-none focus:border-slate-900"
                    >
                      <option value="">Not fixed</option>
                      {model.suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {model.supplierDrafts[supplier.id]?.name || supplier.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input
                    aria-label={`${plan.plan_name} route notes`}
                    value={draft?.notes || ''}
                    onChange={(event) => model.onUpdatePlan(plan.id, { notes: event.target.value })}
                    placeholder="Route notes"
                    className="min-h-8 min-w-0 flex-1 rounded-md border border-transparent bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-slate-300 lg:max-w-xl"
                  />
                </div>

                <div className="overflow-x-auto 2xl:overflow-x-visible">
                  <table className="w-full min-w-[1080px] table-fixed border-collapse text-[11px] 2xl:min-w-0">
                    <thead>
                      <tr>
                        <th
                          colSpan={3}
                          className="border-r border-slate-300 bg-white px-1 py-1 text-left font-semibold text-slate-500"
                        />
                        <th
                          colSpan={segments.length + 1}
                          className="border-r border-slate-400 bg-white px-1 py-1 text-center font-semibold text-slate-900"
                        >
                          Transportation route / cost
                        </th>
                        <th
                          colSpan={2}
                          className="border-r border-slate-400 bg-white px-1 py-1 text-center font-semibold text-slate-900"
                        >
                          Ziyarat by Transport company
                        </th>
                        <th
                          colSpan={3}
                          className="bg-white px-1 py-1 text-center font-semibold text-slate-900"
                        >
                          Molana guide Cost
                        </th>
                      </tr>
                      <tr className="border-b border-slate-300 align-bottom">
                        <th className="w-20 border-r border-slate-200 px-1 py-2 text-left font-semibold text-slate-900">
                          Suppliers
                        </th>
                        <th className="w-14 border-r border-slate-200 px-1 py-2 text-left font-semibold text-slate-900">
                          Vehicle
                        </th>
                        <th className="w-28 border-r border-slate-300 px-1 py-2 text-left font-semibold text-slate-900">
                          PAX
                        </th>
                        {segments.map((segment) => {
                          const usageCount = model.routeUsageCountById.get(segment.route_id) || 0
                          return (
                            <th
                              key={segment.id}
                              className="w-24 border-r border-slate-200 px-1 py-2 text-left font-black leading-4 text-slate-950"
                            >
                              <div>
                                {segment.segment_label ||
                                  routeById.get(segment.route_id)?.route_name ||
                                  'Route segment'}
                              </div>
                              {usageCount > 1 && (
                                <span className="mt-1 inline-flex rounded-sm bg-slate-100 px-1 py-0.5 text-[9px] font-black uppercase text-slate-500">
                                  linked x{usageCount}
                                </span>
                              )}
                            </th>
                          )
                        })}
                        <th className="w-28 border-r border-slate-400 px-1 py-2 text-left font-black text-slate-950">
                          Total per route
                        </th>
                        <th className="w-24 border-r border-slate-200 px-1 py-2 text-left font-black text-slate-950">
                          Makkah
                        </th>
                        <th className="w-24 border-r border-slate-400 px-1 py-2 text-left font-black text-slate-950">
                          Madinah
                        </th>
                        {GUIDE_SERVICES.map((service) => (
                          <th
                            key={service.key}
                            className="w-20 border-r border-slate-200 px-1 py-2 text-left font-semibold text-slate-900 last:border-r-0"
                          >
                            {service.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {model.suppliers.length === 0 || model.vehicles.length === 0 ? (
                        <tr>
                          <td
                            colSpan={tableColumnCount}
                            className="px-3 py-8 text-center text-sm font-semibold text-slate-500"
                          >
                            Add at least one active supplier and one vehicle type.
                          </td>
                        </tr>
                      ) : (
                        model.suppliers.map((supplier, supplierIndex) => {
                          const supplierName =
                            model.supplierDrafts[supplier.id]?.name || supplier.name
                          const supplierIsFixed = fixedSupplierId === supplier.id
                          const dividerClass =
                            SUPPLIER_DIVIDER_CLASSES[
                              supplierIndex % SUPPLIER_DIVIDER_CLASSES.length
                            ]
                          return (
                            <Fragment key={supplier.id}>
                              {supplierIndex > 0 && (
                                <tr aria-hidden="true">
                                  <td
                                    colSpan={tableColumnCount}
                                    className={`h-1.5 p-0 ${dividerClass}`}
                                  />
                                </tr>
                              )}
                              {model.vehicles.map((vehicleType, vehicleIndex) => {
                                const vehicleDraft = model.vehicleDrafts[vehicleType.id]
                                const transportLabelKey = supplierVehicleLabelKey(
                                  supplier.id,
                                  vehicleType.id,
                                )
                                const transportLabel =
                                  model.supplierVehicleLabelDrafts[transportLabelKey] ??
                                  vehicleDraft?.label ??
                                  ''
                                const total = getRouteTotal(
                                  model.rateDrafts,
                                  segments,
                                  supplier.id,
                                  vehicleType.id,
                                )
                                const cheapestTotal =
                                  cheapestTotalByPlanVehicle.get(`${plan.id}:${vehicleType.id}`) ||
                                  0
                                const isCheapestTotal = total > 0 && total === cheapestTotal
                                const vehicleLabel = vehicleDraft?.label || vehicleType.label
                                return (
                                  <tr
                                    key={`${supplier.id}:${vehicleType.id}`}
                                    className={`border-b border-slate-100 ${
                                      supplierIsFixed ? 'bg-red-50/40' : ''
                                    }`}
                                  >
                                    {vehicleIndex === 0 && (
                                      <td
                                        rowSpan={model.vehicles.length}
                                        className={`border-r border-slate-200 px-1 py-2 text-center align-middle text-xs font-semibold text-slate-950 ${
                                          supplierIsFixed ? 'shadow-[inset_4px_0_0_0_#8b1e2d]' : ''
                                        }`}
                                      >
                                        {supplierName}
                                      </td>
                                    )}
                                    <td className="border-r border-slate-200 px-1 py-1">
                                      <input
                                        aria-label={`${supplierName} ${vehicleLabel} transport label`}
                                        value={transportLabel}
                                        onChange={(event) =>
                                          model.onUpdateSupplierVehicleLabel(
                                            supplier.id,
                                            vehicleType.id,
                                            event.target.value,
                                          )
                                        }
                                        className="h-7 w-full rounded-none border-0 bg-transparent text-center text-[11px] font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-red-900/30"
                                        placeholder={vehicleDraft?.label || 'Label'}
                                      />
                                    </td>
                                    <td className="border-r border-slate-300 px-1 py-1">
                                      <input
                                        aria-label={`${vehicleLabel} passenger capacity`}
                                        value={vehicleDraft?.passenger_capacity || ''}
                                        onChange={(event) =>
                                          model.onUpdateVehicle(vehicleType.id, {
                                            passenger_capacity: event.target.value,
                                          })
                                        }
                                        className="h-7 w-full rounded-none border-0 bg-transparent text-[11px] font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-red-900/30"
                                        placeholder="PAX"
                                      />
                                    </td>
                                    {segments.map((segment) => {
                                      const route = routeById.get(segment.route_id)
                                      const routeLabel =
                                        segment.segment_label || route?.route_name || 'route'
                                      return (
                                        <td
                                          key={segment.id}
                                          className="border-r border-slate-200 px-1 py-1"
                                        >
                                          {renderRateInput(
                                            segment.route_id,
                                            routeLabel,
                                            supplier,
                                            supplierName,
                                            vehicleType,
                                          )}
                                        </td>
                                      )
                                    })}
                                    <td
                                      className={`border-r border-slate-400 px-1 py-1 text-right text-[11px] font-black ${
                                        isCheapestTotal
                                          ? 'bg-emerald-50 text-emerald-800'
                                          : 'text-purple-700'
                                      }`}
                                    >
                                      <div className="flex items-center justify-end gap-1">
                                        {isCheapestTotal && (
                                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                        )}
                                        {isCheapestTotal && (
                                          <span className="rounded-sm bg-emerald-100 px-1 text-[9px] font-black uppercase text-emerald-700">
                                            selected
                                          </span>
                                        )}
                                        {formatAmount(total, getSupplierCurrency(supplier.id))}
                                      </div>
                                    </td>
                                    {[
                                      {
                                        route: makkahZiyaratRoute,
                                        label: 'Makkah ziyarat',
                                        border: 'border-slate-200',
                                      },
                                      {
                                        route: madinahZiyaratRoute,
                                        label: 'Madinah ziyarat',
                                        border: 'border-slate-400',
                                      },
                                    ].map(({ route, label, border }) => {
                                      const amount = getRouteAmount(
                                        model.rateDrafts,
                                        route?.id,
                                        supplier.id,
                                        vehicleType.id,
                                      )
                                      const cheapestAmount = route?.id
                                        ? cheapestZiyaratByRouteVehicle.get(
                                            `${route.id}:${vehicleType.id}`,
                                          ) || 0
                                        : 0
                                      const isSelected =
                                        amount > 0 &&
                                        cheapestAmount > 0 &&
                                        amount === cheapestAmount
                                      return (
                                        <td
                                          key={route?.id || border}
                                          className={`border-r ${border} px-1 py-1 ${
                                            isSelected ? 'bg-emerald-50' : ''
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-1">
                                            {renderRateInput(
                                              route?.id,
                                              label,
                                              supplier,
                                              supplierName,
                                              vehicleType,
                                              !route,
                                            )}
                                            {isSelected && (
                                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                            )}
                                          </div>
                                        </td>
                                      )
                                    })}
                                    {GUIDE_SERVICES.map((service) => {
                                      const key = guideKey(supplier.id, service.key)
                                      return (
                                        <td
                                          key={service.key}
                                          className="border-r border-slate-200 px-1 py-1 last:border-r-0"
                                        >
                                          <div className="flex min-h-8 items-center gap-0.5">
                                            <span className="w-7 text-[10px] font-black text-slate-500">
                                              {getSupplierCurrency(supplier.id)}
                                            </span>
                                            <input
                                              aria-label={`${supplierName} ${vehicleLabel} ${service.label} guide cost`}
                                              value={model.guideDrafts[key] || ''}
                                              inputMode="decimal"
                                              onChange={(event) =>
                                                model.onUpdateGuide(
                                                  supplier.id,
                                                  service.key,
                                                  event.target.value,
                                                )
                                              }
                                              className="h-7 w-14 rounded-none border-0 bg-transparent px-1 text-right text-[11px] font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-red-900/30"
                                              placeholder="-"
                                            />
                                          </div>
                                        </td>
                                      )
                                    })}
                                  </tr>
                                )
                              })}
                            </Fragment>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
