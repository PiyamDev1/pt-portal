/**
 * Umrah Transport Pricing Tab
 * Excel-style supplier comparison matrix for Umrah transport route packages.
 *
 * @module app/dashboard/settings/components/pricing/UmrahTransportPricingTab
 */

'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Plus, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  UmrahTransportGuideRate,
  UmrahTransportRate,
  UmrahTransportRoute,
  UmrahTransportRoutePlan,
  UmrahTransportRoutePlanSegment,
  UmrahTransportSupplier,
  UmrahTransportVehicleType,
} from '@/app/types/pricing'

type UmrahTransportPricingTabProps = {
  supabase: SupabaseClient
}

type SupplierDraft = {
  name: string
  default_currency: string
  notes: string
}

type VehicleDraft = {
  label: string
  passenger_capacity: string
}

type PlanDraft = {
  plan_name: string
  preferred_supplier_id: string
  notes: string
}

type RateDrafts = Record<string, string>
type GuideDrafts = Record<string, string>

const GUIDE_SERVICES = [
  { key: 'umrah', label: 'Umrah' },
  { key: 'madinah', label: 'Madinah' },
  { key: 'makkah', label: 'Makkah' },
] as const

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === 'PGRST205'
}

function rateKey(routeId: string, supplierId: string, vehicleTypeId: string) {
  return `${routeId}:${supplierId}:${vehicleTypeId}`
}

function guideKey(supplierId: string, guideService: string) {
  return `${supplierId}:${guideService}`
}

function parseAmount(value: string | number | null | undefined) {
  const normalized = String(value ?? '').replace(/[^0-9.]/g, '')
  const parsed = Number(normalized || 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.round(parsed * 100) / 100)
}

function formatAmount(amount: number, currency: string) {
  if (!amount) return '-'
  return `${currency || 'SAR'} ${amount.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function normaliseLabel(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function UmrahTransportPricingTabCore({ supabase }: UmrahTransportPricingTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [suppliers, setSuppliers] = useState<UmrahTransportSupplier[]>([])
  const [vehicleTypes, setVehicleTypes] = useState<UmrahTransportVehicleType[]>([])
  const [routes, setRoutes] = useState<UmrahTransportRoute[]>([])
  const [routePlans, setRoutePlans] = useState<UmrahTransportRoutePlan[]>([])
  const [planSegments, setPlanSegments] = useState<UmrahTransportRoutePlanSegment[]>([])
  const [supplierDrafts, setSupplierDrafts] = useState<Record<string, SupplierDraft>>({})
  const [vehicleDrafts, setVehicleDrafts] = useState<Record<string, VehicleDraft>>({})
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({})
  const [rateDrafts, setRateDrafts] = useState<RateDrafts>({})
  const [originalRateDrafts, setOriginalRateDrafts] = useState<RateDrafts>({})
  const [guideDrafts, setGuideDrafts] = useState<GuideDrafts>({})
  const [originalGuideDrafts, setOriginalGuideDrafts] = useState<GuideDrafts>({})
  const [dirtySupplierIds, setDirtySupplierIds] = useState<Set<string>>(new Set())
  const [dirtyVehicleIds, setDirtyVehicleIds] = useState<Set<string>>(new Set())
  const [dirtyPlanIds, setDirtyPlanIds] = useState<Set<string>>(new Set())
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newVehicleLabel, setNewVehicleLabel] = useState('')
  const [newVehicleCapacity, setNewVehicleCapacity] = useState('')

  const loadTransportPricing = useCallback(async () => {
    setLoading(true)
    setSchemaMissing(false)
    try {
      const [supplierRes, vehicleRes, routeRes, routePlanRes, planSegmentRes, rateRes, guideRes] =
        await Promise.all([
          supabase
            .from('umrah_transport_suppliers')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true }),
          supabase
            .from('umrah_transport_vehicle_types')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('label', { ascending: true }),
          supabase
            .from('umrah_transport_routes')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('route_name', { ascending: true }),
          supabase
            .from('umrah_transport_route_plans')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('plan_name', { ascending: true }),
          supabase
            .from('umrah_transport_route_plan_segments')
            .select('*')
            .order('sort_order', { ascending: true }),
          supabase.from('umrah_transport_rates').select('*'),
          supabase.from('umrah_transport_guide_rates').select('*'),
        ])

      const firstError =
        supplierRes.error ||
        vehicleRes.error ||
        routeRes.error ||
        routePlanRes.error ||
        planSegmentRes.error ||
        rateRes.error ||
        guideRes.error
      if (firstError) {
        if (isSchemaError(firstError)) {
          setSchemaMissing(true)
          return
        }
        throw firstError
      }

      const nextSuppliers = (supplierRes.data || []) as UmrahTransportSupplier[]
      const nextVehicleTypes = (vehicleRes.data || []) as UmrahTransportVehicleType[]
      const nextRoutes = (routeRes.data || []) as UmrahTransportRoute[]
      const nextRoutePlans = (routePlanRes.data || []) as UmrahTransportRoutePlan[]
      const nextPlanSegments = (planSegmentRes.data || []) as UmrahTransportRoutePlanSegment[]
      const nextRates = (rateRes.data || []) as UmrahTransportRate[]
      const nextGuideRates = (guideRes.data || []) as UmrahTransportGuideRate[]

      const nextSupplierDrafts = Object.fromEntries(
        nextSuppliers.map((supplier) => [
          supplier.id,
          {
            name: supplier.name,
            default_currency: supplier.default_currency || 'SAR',
            notes: supplier.notes || '',
          },
        ]),
      )
      const nextVehicleDrafts = Object.fromEntries(
        nextVehicleTypes.map((vehicleType) => [
          vehicleType.id,
          {
            label: vehicleType.label,
            passenger_capacity: vehicleType.passenger_capacity || '',
          },
        ]),
      )
      const nextPlanDrafts = Object.fromEntries(
        nextRoutePlans.map((plan) => [
          plan.id,
          {
            plan_name: plan.plan_name,
            preferred_supplier_id: plan.preferred_supplier_id || '',
            notes: plan.notes || '',
          },
        ]),
      )
      const nextRateDrafts: RateDrafts = {}
      nextRates.forEach((rate) => {
        nextRateDrafts[rateKey(rate.route_id, rate.supplier_id, rate.vehicle_type_id)] =
          rate.cost_price ? String(rate.cost_price) : ''
      })
      const nextGuideDrafts: GuideDrafts = {}
      nextGuideRates.forEach((rate) => {
        nextGuideDrafts[guideKey(rate.supplier_id, rate.guide_service)] = rate.cost_price
          ? String(rate.cost_price)
          : ''
      })

      setSuppliers(nextSuppliers)
      setVehicleTypes(nextVehicleTypes)
      setRoutes(nextRoutes)
      setRoutePlans(nextRoutePlans)
      setPlanSegments(nextPlanSegments)
      setSupplierDrafts(nextSupplierDrafts)
      setVehicleDrafts(nextVehicleDrafts)
      setPlanDrafts(nextPlanDrafts)
      setRateDrafts(nextRateDrafts)
      setOriginalRateDrafts(nextRateDrafts)
      setGuideDrafts(nextGuideDrafts)
      setOriginalGuideDrafts(nextGuideDrafts)
      setDirtySupplierIds(new Set())
      setDirtyVehicleIds(new Set())
      setDirtyPlanIds(new Set())
    } catch (error) {
      console.error('[UmrahTransportPricingTab] Failed to load transport pricing:', error)
      toast.error('Failed to load Umrah transport pricing')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    void loadTransportPricing()
  }, [loadTransportPricing])

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.is_active),
    [suppliers],
  )

  const activeVehicleTypes = useMemo(
    () => vehicleTypes.filter((vehicleType) => vehicleType.is_active),
    [vehicleTypes],
  )

  const activeRoutePlans = useMemo(
    () => routePlans.filter((plan) => plan.is_active),
    [routePlans],
  )

  const routeById = useMemo(() => {
    return new Map(routes.map((route) => [route.id, route]))
  }, [routes])

  const segmentsByPlanId = useMemo(() => {
    const result = new Map<string, UmrahTransportRoutePlanSegment[]>()
    planSegments.forEach((segment) => {
      const segments = result.get(segment.plan_id) || []
      segments.push(segment)
      result.set(segment.plan_id, segments)
    })
    result.forEach((segments) => {
      segments.sort((a, b) => a.sort_order - b.sort_order)
    })
    return result
  }, [planSegments])

  const makkahZiyaratRoute = useMemo(() => {
    return (
      routes.find((route) => normaliseLabel(route.route_name) === 'makkah ziyarat') ||
      routes.find((route) => {
        const label = normaliseLabel(route.route_name)
        return label.includes('makkah') && (label.includes('ziyarat') || label.includes('mazarat'))
      }) ||
      null
    )
  }, [routes])

  const madinahZiyaratRoute = useMemo(() => {
    return (
      routes.find((route) => normaliseLabel(route.route_name) === 'madinah ziyarat') ||
      routes.find((route) => {
        const label = normaliseLabel(route.route_name)
        return (
          (label.includes('madinah') || label.includes('madina')) &&
          (label.includes('ziyarat') || label.includes('mazarat'))
        )
      }) ||
      null
    )
  }, [routes])

  const dirtyRateEntries = useMemo(() => {
    return Object.entries(rateDrafts).filter(
      ([key, value]) => String(value || '') !== String(originalRateDrafts[key] || ''),
    )
  }, [originalRateDrafts, rateDrafts])

  const dirtyGuideEntries = useMemo(() => {
    return Object.entries(guideDrafts).filter(
      ([key, value]) => String(value || '') !== String(originalGuideDrafts[key] || ''),
    )
  }, [guideDrafts, originalGuideDrafts])

  const hasUnsavedChanges =
    dirtySupplierIds.size > 0 ||
    dirtyVehicleIds.size > 0 ||
    dirtyPlanIds.size > 0 ||
    dirtyRateEntries.length > 0 ||
    dirtyGuideEntries.length > 0

  const updateSupplierDraft = (supplierId: string, changes: Partial<SupplierDraft>) => {
    setSupplierDrafts((current) => ({
      ...current,
      [supplierId]: {
        ...(current[supplierId] || { name: '', default_currency: 'SAR', notes: '' }),
        ...changes,
      },
    }))
    setDirtySupplierIds((current) => new Set(current).add(supplierId))
  }

  const updateVehicleDraft = (vehicleTypeId: string, changes: Partial<VehicleDraft>) => {
    setVehicleDrafts((current) => ({
      ...current,
      [vehicleTypeId]: {
        ...(current[vehicleTypeId] || { label: '', passenger_capacity: '' }),
        ...changes,
      },
    }))
    setDirtyVehicleIds((current) => new Set(current).add(vehicleTypeId))
  }

  const updatePlanDraft = (planId: string, changes: Partial<PlanDraft>) => {
    setPlanDrafts((current) => ({
      ...current,
      [planId]: {
        ...(current[planId] || { plan_name: '', preferred_supplier_id: '', notes: '' }),
        ...changes,
      },
    }))
    setDirtyPlanIds((current) => new Set(current).add(planId))
  }

  const updateRateDraft = (
    routeId: string | undefined,
    supplierId: string,
    vehicleTypeId: string,
    value: string,
  ) => {
    if (!routeId) return
    setRateDrafts((current) => ({
      ...current,
      [rateKey(routeId, supplierId, vehicleTypeId)]: value,
    }))
  }

  const updateGuideDraft = (supplierId: string, guideService: string, value: string) => {
    setGuideDrafts((current) => ({
      ...current,
      [guideKey(supplierId, guideService)]: value,
    }))
  }

  const getSupplierCurrency = useCallback(
    (supplierId: string) => {
      return supplierDrafts[supplierId]?.default_currency || 'SAR'
    },
    [supplierDrafts],
  )

  const getRouteTotal = useCallback(
    (
      segments: UmrahTransportRoutePlanSegment[],
      supplierId: string,
      vehicleTypeId: string,
    ) => {
      return segments.reduce((total, segment) => {
        return total + parseAmount(rateDrafts[rateKey(segment.route_id, supplierId, vehicleTypeId)])
      }, 0)
    },
    [rateDrafts],
  )

  const cheapestTotalByPlanVehicle = useMemo(() => {
    const result = new Map<string, number>()
    activeRoutePlans.forEach((plan) => {
      const segments = segmentsByPlanId.get(plan.id) || []
      activeVehicleTypes.forEach((vehicleType) => {
        const totals = activeSuppliers
          .map((supplier) => getRouteTotal(segments, supplier.id, vehicleType.id))
          .filter((amount) => amount > 0)
        if (totals.length > 0) {
          result.set(`${plan.id}:${vehicleType.id}`, Math.min(...totals))
        }
      })
    })
    return result
  }, [activeRoutePlans, activeSuppliers, activeVehicleTypes, getRouteTotal, segmentsByPlanId])

  const addSupplier = async () => {
    const name = newSupplierName.trim()
    if (!name) {
      toast.error('Supplier name is required')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('umrah_transport_suppliers').insert({
        name,
        default_currency: 'SAR',
        sort_order: (suppliers.length + 1) * 10,
        is_active: true,
      })
      if (error) throw error
      setNewSupplierName('')
      toast.success('Supplier added')
      await loadTransportPricing()
    } catch (error) {
      console.error('[UmrahTransportPricingTab] Failed to add supplier:', error)
      toast.error('Failed to add supplier')
    } finally {
      setSaving(false)
    }
  }

  const addVehicleType = async () => {
    const label = newVehicleLabel.trim()
    if (!label) {
      toast.error('Vehicle type is required')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('umrah_transport_vehicle_types').insert({
        label,
        passenger_capacity: newVehicleCapacity.trim() || null,
        sort_order: (vehicleTypes.length + 1) * 10,
        is_active: true,
      })
      if (error) throw error
      setNewVehicleLabel('')
      setNewVehicleCapacity('')
      toast.success('Vehicle type added')
      await loadTransportPricing()
    } catch (error) {
      console.error('[UmrahTransportPricingTab] Failed to add vehicle type:', error)
      toast.error('Failed to add vehicle type')
    } finally {
      setSaving(false)
    }
  }

  const saveChanges = async () => {
    setSaving(true)
    try {
      const supplierUpdates = Array.from(dirtySupplierIds).map((supplierId) => {
        const draft = supplierDrafts[supplierId]
        return supabase
          .from('umrah_transport_suppliers')
          .update({
            name: draft?.name?.trim() || 'Unnamed supplier',
            default_currency: draft?.default_currency || 'SAR',
            notes: draft?.notes?.trim() || null,
          })
          .eq('id', supplierId)
      })

      const vehicleUpdates = Array.from(dirtyVehicleIds).map((vehicleTypeId) => {
        const draft = vehicleDrafts[vehicleTypeId]
        return supabase
          .from('umrah_transport_vehicle_types')
          .update({
            label: draft?.label?.trim() || 'Unnamed vehicle',
            passenger_capacity: draft?.passenger_capacity?.trim() || null,
          })
          .eq('id', vehicleTypeId)
      })

      const planUpdates = Array.from(dirtyPlanIds).map((planId) => {
        const draft = planDrafts[planId]
        return supabase
          .from('umrah_transport_route_plans')
          .update({
            plan_name: draft?.plan_name?.trim() || 'Unnamed route plan',
            preferred_supplier_id: draft?.preferred_supplier_id || null,
            notes: draft?.notes?.trim() || null,
          })
          .eq('id', planId)
      })

      const rateRows = dirtyRateEntries
        .map(([key, value]) => {
          const [routeId, supplierId, vehicleTypeId] = key.split(':')
          if (!routeId || !supplierId || !vehicleTypeId) return null
          return {
            route_id: routeId,
            supplier_id: supplierId,
            vehicle_type_id: vehicleTypeId,
            currency: getSupplierCurrency(supplierId),
            cost_price: parseAmount(value),
            is_active: true,
          }
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))

      const guideRows = dirtyGuideEntries
        .map(([key, value]) => {
          const [supplierId, guideService] = key.split(':')
          if (!supplierId || !guideService) return null
          return {
            supplier_id: supplierId,
            guide_service: guideService,
            currency: getSupplierCurrency(supplierId),
            cost_price: parseAmount(value),
            is_active: true,
          }
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))

      const updateResults = await Promise.all([
        ...supplierUpdates,
        ...vehicleUpdates,
        ...planUpdates,
      ])
      const updateError = updateResults.find((result) => result.error)?.error
      if (updateError) throw updateError

      if (dirtySupplierIds.size > 0) {
        const currencyUpdates = await Promise.all(
          Array.from(dirtySupplierIds).flatMap((supplierId) => [
            supabase
              .from('umrah_transport_rates')
              .update({ currency: getSupplierCurrency(supplierId) })
              .eq('supplier_id', supplierId),
            supabase
              .from('umrah_transport_guide_rates')
              .update({ currency: getSupplierCurrency(supplierId) })
              .eq('supplier_id', supplierId),
          ]),
        )
        const currencyError = currencyUpdates.find((result) => result.error)?.error
        if (currencyError) throw currencyError
      }

      if (rateRows.length > 0) {
        const { error } = await supabase
          .from('umrah_transport_rates')
          .upsert(rateRows, { onConflict: 'route_id,supplier_id,vehicle_type_id' })
        if (error) throw error
      }

      if (guideRows.length > 0) {
        const { error } = await supabase
          .from('umrah_transport_guide_rates')
          .upsert(guideRows, { onConflict: 'supplier_id,guide_service' })
        if (error) throw error
      }

      toast.success('Umrah transport pricing saved')
      await loadTransportPricing()
    } catch (error) {
      console.error('[UmrahTransportPricingTab] Failed to save transport pricing:', error)
      toast.error('Failed to save Umrah transport pricing')
    } finally {
      setSaving(false)
    }
  }

  const renderRateInput = (
    routeId: string | undefined,
    supplierId: string,
    vehicleTypeId: string,
    disabled = false,
  ) => {
    const key = routeId ? rateKey(routeId, supplierId, vehicleTypeId) : ''
    const value = key ? rateDrafts[key] || '' : ''
    return (
      <div className="flex min-h-9 items-center gap-1">
        <span className="w-9 text-[11px] font-black text-slate-500">
          {getSupplierCurrency(supplierId)}
        </span>
        <input
          value={value}
          inputMode="decimal"
          onChange={(event) =>
            updateRateDraft(routeId, supplierId, vehicleTypeId, event.target.value)
          }
          disabled={disabled || !routeId}
          className="h-8 w-20 rounded-none border-0 bg-transparent px-1 text-right text-xs font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-red-900/30 disabled:text-slate-300"
          placeholder="-"
        />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm font-semibold text-slate-600">
        Loading Umrah transport pricing...
      </div>
    )
  }

  if (schemaMissing) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <p className="font-black text-amber-950">Umrah transport pricing schema required</p>
            <p className="mt-1 text-sm text-amber-900">
              Run scripts/migrations/20260714_create_umrah_transport_pricing.sql in Supabase, then
              refresh this page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">Umrah Transport Rates</h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-600">
              Enter supplier costs in route blocks. Totals are calculated per supplier and vehicle,
              cheapest totals are highlighted, and the fixed supplier per route is used later for
              package transport net costs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadTransportPricing()}
              disabled={saving}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void saveChanges()}
              disabled={saving || !hasUnsavedChanges}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          {activeRoutePlans.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500">
              No Umrah route plans configured yet.
            </div>
          ) : (
            activeRoutePlans.map((plan) => {
              const segments = segmentsByPlanId.get(plan.id) || []
              const draft = planDrafts[plan.id]
              const fixedSupplierId = draft?.preferred_supplier_id || ''
              const tableColumnCount = segments.length + 9
              return (
                <section
                  key={plan.id}
                  className="overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm"
                >
                  <div className="border-b border-slate-950 bg-slate-950 px-3 py-2">
                    <input
                      value={draft?.plan_name || ''}
                      onChange={(event) =>
                        updatePlanDraft(plan.id, { plan_name: event.target.value })
                      }
                      className="w-full bg-transparent text-center text-sm font-black uppercase tracking-wide text-white outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
                    <label className="flex flex-wrap items-center gap-2 text-xs font-black uppercase text-slate-500">
                      Fixed supplier
                      <select
                        value={fixedSupplierId}
                        onChange={(event) =>
                          updatePlanDraft(plan.id, {
                            preferred_supplier_id: event.target.value,
                          })
                        }
                        className="min-h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-black normal-case text-slate-900 outline-none focus:border-slate-900"
                      >
                        <option value="">Not fixed</option>
                        {activeSuppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplierDrafts[supplier.id]?.name || supplier.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <input
                      value={draft?.notes || ''}
                      onChange={(event) => updatePlanDraft(plan.id, { notes: event.target.value })}
                      placeholder="Route notes"
                      className="min-h-8 min-w-0 flex-1 rounded-md border border-transparent bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-slate-300 lg:max-w-xl"
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] border-collapse text-xs">
                      <thead>
                        <tr>
                          <th
                            colSpan={3}
                            className="border-r border-slate-300 bg-white px-2 py-1 text-left font-semibold text-slate-500"
                          />
                          <th
                            colSpan={segments.length + 1}
                            className="border-r border-slate-400 bg-white px-2 py-1 text-center font-semibold text-slate-900"
                          >
                            Transportation route / cost
                          </th>
                          <th
                            colSpan={2}
                            className="border-r border-slate-400 bg-white px-2 py-1 text-center font-semibold text-slate-900"
                          >
                            Ziyarat by Transport company
                          </th>
                          <th
                            colSpan={3}
                            className="bg-white px-2 py-1 text-center font-semibold text-slate-900"
                          >
                            Molana guide Cost
                          </th>
                        </tr>
                        <tr className="border-b border-slate-300 align-bottom">
                          <th className="w-28 border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-900">
                            Suppliers
                          </th>
                          <th className="w-20 border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-900">
                            Vehicle
                          </th>
                          <th className="w-36 border-r border-slate-300 px-2 py-2 text-left font-semibold text-slate-900">
                            PAX
                          </th>
                          {segments.map((segment) => (
                            <th
                              key={segment.id}
                              className="min-w-32 border-r border-slate-200 px-2 py-2 text-left font-black text-slate-950"
                            >
                              {segment.segment_label ||
                                routeById.get(segment.route_id)?.route_name ||
                                'Route segment'}
                            </th>
                          ))}
                          <th className="min-w-32 border-r border-slate-400 px-2 py-2 text-left font-black text-slate-950">
                            Total per route
                          </th>
                          <th className="min-w-28 border-r border-slate-200 px-2 py-2 text-left font-black text-slate-950">
                            Makkah
                          </th>
                          <th className="min-w-28 border-r border-slate-400 px-2 py-2 text-left font-black text-slate-950">
                            Madinah
                          </th>
                          {GUIDE_SERVICES.map((service) => (
                            <th
                              key={service.key}
                              className="min-w-24 border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-900 last:border-r-0"
                            >
                              {service.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activeSuppliers.length === 0 || activeVehicleTypes.length === 0 ? (
                          <tr>
                            <td
                              colSpan={tableColumnCount}
                              className="px-3 py-8 text-center text-sm font-semibold text-slate-500"
                            >
                              Add at least one active supplier and one vehicle type.
                            </td>
                          </tr>
                        ) : (
                          activeSuppliers.map((supplier) => {
                            const supplierName = supplierDrafts[supplier.id]?.name || supplier.name
                            const supplierIsFixed = fixedSupplierId === supplier.id
                            return activeVehicleTypes.map((vehicleType, vehicleIndex) => {
                              const vehicleDraft = vehicleDrafts[vehicleType.id]
                              const total = getRouteTotal(segments, supplier.id, vehicleType.id)
                              const cheapestTotal =
                                cheapestTotalByPlanVehicle.get(`${plan.id}:${vehicleType.id}`) || 0
                              const isCheapestTotal = total > 0 && total === cheapestTotal
                              return (
                                <tr
                                  key={`${supplier.id}:${vehicleType.id}`}
                                  className={`border-b border-slate-100 ${
                                    supplierIsFixed ? 'bg-red-50/40' : ''
                                  }`}
                                >
                                  {vehicleIndex === 0 && (
                                    <td
                                      rowSpan={activeVehicleTypes.length}
                                      className={`border-r border-slate-200 px-2 py-2 text-center align-middle text-sm font-semibold text-slate-950 ${
                                        supplierIsFixed
                                          ? 'shadow-[inset_4px_0_0_0_#8b1e2d]'
                                          : ''
                                      }`}
                                    >
                                      {supplierName}
                                    </td>
                                  )}
                                  <td className="border-r border-slate-200 px-2 py-1">
                                    <input
                                      value={vehicleDraft?.label || ''}
                                      onChange={(event) =>
                                        updateVehicleDraft(vehicleType.id, {
                                          label: event.target.value,
                                        })
                                      }
                                      className="h-8 w-full rounded-none border-0 bg-transparent text-center text-xs font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-red-900/30"
                                    />
                                  </td>
                                  <td className="border-r border-slate-300 px-2 py-1">
                                    <input
                                      value={vehicleDraft?.passenger_capacity || ''}
                                      onChange={(event) =>
                                        updateVehicleDraft(vehicleType.id, {
                                          passenger_capacity: event.target.value,
                                        })
                                      }
                                      className="h-8 w-full rounded-none border-0 bg-transparent text-xs font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-red-900/30"
                                      placeholder="PAX"
                                    />
                                  </td>
                                  {segments.map((segment) => (
                                    <td
                                      key={segment.id}
                                      className="border-r border-slate-200 px-2 py-1"
                                    >
                                      {renderRateInput(
                                        segment.route_id,
                                        supplier.id,
                                        vehicleType.id,
                                      )}
                                    </td>
                                  ))}
                                  <td
                                    className={`border-r border-slate-400 px-2 py-1 text-right text-xs font-black ${
                                      isCheapestTotal
                                        ? 'bg-emerald-50 text-emerald-800'
                                        : 'text-purple-700'
                                    }`}
                                  >
                                    <div className="flex items-center justify-end gap-1">
                                      {isCheapestTotal && (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                      )}
                                      {formatAmount(total, getSupplierCurrency(supplier.id))}
                                    </div>
                                  </td>
                                  <td className="border-r border-slate-200 px-2 py-1">
                                    {renderRateInput(
                                      makkahZiyaratRoute?.id,
                                      supplier.id,
                                      vehicleType.id,
                                      !makkahZiyaratRoute,
                                    )}
                                  </td>
                                  <td className="border-r border-slate-400 px-2 py-1">
                                    {renderRateInput(
                                      madinahZiyaratRoute?.id,
                                      supplier.id,
                                      vehicleType.id,
                                      !madinahZiyaratRoute,
                                    )}
                                  </td>
                                  {GUIDE_SERVICES.map((service) => {
                                    const key = guideKey(supplier.id, service.key)
                                    return (
                                      <td
                                        key={service.key}
                                        className="border-r border-slate-200 px-2 py-1 last:border-r-0"
                                      >
                                        <div className="flex min-h-9 items-center gap-1">
                                          <span className="w-9 text-[11px] font-black text-slate-500">
                                            {getSupplierCurrency(supplier.id)}
                                          </span>
                                          <input
                                            value={guideDrafts[key] || ''}
                                            inputMode="decimal"
                                            onChange={(event) =>
                                              updateGuideDraft(
                                                supplier.id,
                                                service.key,
                                                event.target.value,
                                              )
                                            }
                                            className="h-8 w-20 rounded-none border-0 bg-transparent px-1 text-right text-xs font-semibold text-slate-950 outline-none focus:bg-white focus:ring-2 focus:ring-red-900/30"
                                            placeholder="-"
                                          />
                                        </div>
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )
            })
          )}
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-950">Suppliers</p>
            <div className="mt-3 space-y-2">
              {suppliers.map((supplier) => (
                <div key={supplier.id} className="grid grid-cols-[1fr_5rem] gap-2">
                  <input
                    value={supplierDrafts[supplier.id]?.name || ''}
                    onChange={(event) =>
                      updateSupplierDraft(supplier.id, { name: event.target.value })
                    }
                    className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                  />
                  <select
                    value={supplierDrafts[supplier.id]?.default_currency || 'SAR'}
                    onChange={(event) =>
                      updateSupplierDraft(supplier.id, {
                        default_currency: event.target.value,
                      })
                    }
                    className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-slate-900"
                  >
                    <option value="SAR">SAR</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <input
                value={newSupplierName}
                onChange={(event) => setNewSupplierName(event.target.value)}
                placeholder="New supplier"
                className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <button
                type="button"
                onClick={() => void addSupplier()}
                disabled={saving}
                className="inline-flex min-h-10 items-center justify-center rounded-lg bg-slate-900 px-3 text-white disabled:opacity-50"
                title="Add supplier"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-950">Vehicle / PAX Rows</p>
            <div className="mt-3 space-y-2">
              {activeVehicleTypes.map((vehicleType) => (
                <div key={vehicleType.id} className="rounded-lg border border-slate-100 p-2">
                  <input
                    value={vehicleDrafts[vehicleType.id]?.label || ''}
                    onChange={(event) =>
                      updateVehicleDraft(vehicleType.id, { label: event.target.value })
                    }
                    className="min-h-9 w-full rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-slate-900"
                    placeholder="Vehicle"
                  />
                  <input
                    value={vehicleDrafts[vehicleType.id]?.passenger_capacity || ''}
                    onChange={(event) =>
                      updateVehicleDraft(vehicleType.id, {
                        passenger_capacity: event.target.value,
                      })
                    }
                    className="mt-2 min-h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-slate-900"
                    placeholder="PAX"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              <input
                value={newVehicleLabel}
                onChange={(event) => setNewVehicleLabel(event.target.value)}
                placeholder="New vehicle"
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <input
                value={newVehicleCapacity}
                onChange={(event) => setNewVehicleCapacity(event.target.value)}
                placeholder="PAX label"
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <button
                type="button"
                onClick={() => void addVehicleType()}
                disabled={saving}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Vehicle Row
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-950">Grid Summary</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Route sections</span>
                <span className="font-black text-slate-950">{activeRoutePlans.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Suppliers</span>
                <span className="font-black text-slate-950">{activeSuppliers.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Vehicle rows</span>
                <span className="font-black text-slate-950">{activeVehicleTypes.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Edited route cells</span>
                <span className="font-black text-slate-950">{dirtyRateEntries.length}</span>
              </div>
              <div className="rounded-lg bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
                Green totals show the cheapest positive supplier total for that route section and
                vehicle row. A red-tinted supplier group marks the fixed supplier selected by the
                manager.
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default memo(UmrahTransportPricingTabCore)
