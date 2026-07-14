/**
 * Umrah Transport Pricing Tab
 * Supplier comparison matrix for Umrah transport route net costs.
 *
 * @module app/dashboard/settings/components/pricing/UmrahTransportPricingTab
 */

'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Plus, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  UmrahTransportRate,
  UmrahTransportRoute,
  UmrahTransportSupplier,
  UmrahTransportVehicleType,
} from '@/app/types/pricing'

type UmrahTransportPricingTabProps = {
  supabase: SupabaseClient
}

type SupplierDraft = {
  name: string
  notes: string
}

type RouteDraft = {
  route_name: string
  preferred_supplier_id: string
  notes: string
}

type RateDrafts = Record<string, string>

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === 'PGRST205'
}

function rateKey(routeId: string, supplierId: string, vehicleTypeId: string) {
  return `${routeId}:${supplierId}:${vehicleTypeId}`
}

function parseAmount(value: string | number | null | undefined) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.round(parsed * 100) / 100)
}

function UmrahTransportPricingTabCore({ supabase }: UmrahTransportPricingTabProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [suppliers, setSuppliers] = useState<UmrahTransportSupplier[]>([])
  const [vehicleTypes, setVehicleTypes] = useState<UmrahTransportVehicleType[]>([])
  const [routes, setRoutes] = useState<UmrahTransportRoute[]>([])
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState('')
  const [supplierDrafts, setSupplierDrafts] = useState<Record<string, SupplierDraft>>({})
  const [routeDrafts, setRouteDrafts] = useState<Record<string, RouteDraft>>({})
  const [rateDrafts, setRateDrafts] = useState<RateDrafts>({})
  const [originalRateDrafts, setOriginalRateDrafts] = useState<RateDrafts>({})
  const [dirtySupplierIds, setDirtySupplierIds] = useState<Set<string>>(new Set())
  const [dirtyRouteIds, setDirtyRouteIds] = useState<Set<string>>(new Set())
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newRouteName, setNewRouteName] = useState('')
  const [newRouteNotes, setNewRouteNotes] = useState('')
  const [newVehicleLabel, setNewVehicleLabel] = useState('')
  const [newVehicleCapacity, setNewVehicleCapacity] = useState('')

  const loadTransportPricing = useCallback(async () => {
    setLoading(true)
    setSchemaMissing(false)
    try {
      const [supplierRes, vehicleRes, routeRes, rateRes] = await Promise.all([
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
        supabase.from('umrah_transport_rates').select('*'),
      ])

      const firstError = supplierRes.error || vehicleRes.error || routeRes.error || rateRes.error
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
      const nextRates = (rateRes.data || []) as UmrahTransportRate[]

      const nextSupplierDrafts = Object.fromEntries(
        nextSuppliers.map((supplier) => [
          supplier.id,
          { name: supplier.name, notes: supplier.notes || '' },
        ]),
      )
      const nextRouteDrafts = Object.fromEntries(
        nextRoutes.map((route) => [
          route.id,
          {
            route_name: route.route_name,
            preferred_supplier_id: route.preferred_supplier_id || '',
            notes: route.notes || '',
          },
        ]),
      )
      const nextRateDrafts: RateDrafts = {}
      nextRates.forEach((rate) => {
        nextRateDrafts[rateKey(rate.route_id, rate.supplier_id, rate.vehicle_type_id)] =
          rate.cost_price ? String(rate.cost_price) : ''
      })

      setSuppliers(nextSuppliers)
      setVehicleTypes(nextVehicleTypes)
      setRoutes(nextRoutes)
      setSupplierDrafts(nextSupplierDrafts)
      setRouteDrafts(nextRouteDrafts)
      setRateDrafts(nextRateDrafts)
      setOriginalRateDrafts(nextRateDrafts)
      setDirtySupplierIds(new Set())
      setDirtyRouteIds(new Set())
      setSelectedVehicleTypeId((current) =>
        current && nextVehicleTypes.some((vehicleType) => vehicleType.id === current)
          ? current
          : nextVehicleTypes[0]?.id || '',
      )
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

  const selectedVehicleType = useMemo(
    () => vehicleTypes.find((vehicleType) => vehicleType.id === selectedVehicleTypeId) || null,
    [selectedVehicleTypeId, vehicleTypes],
  )

  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.is_active),
    [suppliers],
  )

  const dirtyRateEntries = useMemo(() => {
    return Object.entries(rateDrafts).filter(
      ([key, value]) => String(value || '') !== String(originalRateDrafts[key] || ''),
    )
  }, [originalRateDrafts, rateDrafts])

  const hasUnsavedChanges =
    dirtySupplierIds.size > 0 || dirtyRouteIds.size > 0 || dirtyRateEntries.length > 0

  const updateSupplierDraft = (supplierId: string, changes: Partial<SupplierDraft>) => {
    setSupplierDrafts((current) => ({
      ...current,
      [supplierId]: { ...(current[supplierId] || { name: '', notes: '' }), ...changes },
    }))
    setDirtySupplierIds((current) => new Set(current).add(supplierId))
  }

  const updateRouteDraft = (routeId: string, changes: Partial<RouteDraft>) => {
    setRouteDrafts((current) => ({
      ...current,
      [routeId]: {
        ...(current[routeId] || { route_name: '', preferred_supplier_id: '', notes: '' }),
        ...changes,
      },
    }))
    setDirtyRouteIds((current) => new Set(current).add(routeId))
  }

  const updateRateDraft = (routeId: string, supplierId: string, value: string) => {
    if (!selectedVehicleTypeId) return
    setRateDrafts((current) => ({
      ...current,
      [rateKey(routeId, supplierId, selectedVehicleTypeId)]: value,
    }))
  }

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

  const addRoute = async () => {
    const routeName = newRouteName.trim()
    if (!routeName) {
      toast.error('Route name is required')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('umrah_transport_routes').insert({
        route_name: routeName,
        notes: newRouteNotes.trim() || null,
        sort_order: (routes.length + 1) * 10,
        is_active: true,
      })
      if (error) throw error
      setNewRouteName('')
      setNewRouteNotes('')
      toast.success('Route added')
      await loadTransportPricing()
    } catch (error) {
      console.error('[UmrahTransportPricingTab] Failed to add route:', error)
      toast.error('Failed to add route')
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
            notes: draft?.notes?.trim() || null,
          })
          .eq('id', supplierId)
      })

      const routeUpdates = Array.from(dirtyRouteIds).map((routeId) => {
        const draft = routeDrafts[routeId]
        return supabase
          .from('umrah_transport_routes')
          .update({
            route_name: draft?.route_name?.trim() || 'Unnamed route',
            preferred_supplier_id: draft?.preferred_supplier_id || null,
            notes: draft?.notes?.trim() || null,
          })
          .eq('id', routeId)
      })

      const rateRows = dirtyRateEntries
        .map(([key, value]) => {
          const [routeId, supplierId, vehicleTypeId] = key.split(':')
          if (!routeId || !supplierId || !vehicleTypeId) return null
          return {
            route_id: routeId,
            supplier_id: supplierId,
            vehicle_type_id: vehicleTypeId,
            currency: 'SAR',
            cost_price: parseAmount(value),
            is_active: true,
          }
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))

      const updateResults = await Promise.all([...supplierUpdates, ...routeUpdates])
      const updateError = updateResults.find((result) => result.error)?.error
      if (updateError) throw updateError

      if (rateRows.length > 0) {
        const { error } = await supabase
          .from('umrah_transport_rates')
          .upsert(rateRows, { onConflict: 'route_id,supplier_id,vehicle_type_id' })
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

  const cheapestAmountByRoute = useMemo(() => {
    const result = new Map<string, number>()
    if (!selectedVehicleTypeId) return result
    routes.forEach((route) => {
      const amounts = activeSuppliers
        .map((supplier) =>
          parseAmount(rateDrafts[rateKey(route.id, supplier.id, selectedVehicleTypeId)]),
        )
        .filter((amount) => amount > 0)
      if (amounts.length > 0) result.set(route.id, Math.min(...amounts))
    })
    return result
  }, [activeSuppliers, rateDrafts, routes, selectedVehicleTypeId])

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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">Umrah Transport Rates</h3>
            <p className="mt-1 text-sm text-slate-600">
              Enter net supplier costs by route. The cheapest supplier is highlighted, and the fixed
              supplier per route is what later modules should use.
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">Comparison Grid</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Vehicle type: {selectedVehicleType?.label || 'Not selected'}
                {selectedVehicleType?.passenger_capacity
                  ? ` (${selectedVehicleType.passenger_capacity})`
                  : ''}
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-slate-500">Vehicle type</span>
              <select
                value={selectedVehicleTypeId}
                onChange={(event) => setSelectedVehicleTypeId(event.target.value)}
                className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-slate-900"
              >
                {vehicleTypes.map((vehicleType) => (
                  <option key={vehicleType.id} value={vehicleType.id}>
                    {vehicleType.label}
                    {vehicleType.passenger_capacity ? ` (${vehicleType.passenger_capacity})` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-10 min-w-72 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-black uppercase text-slate-500">
                    Route
                  </th>
                  {activeSuppliers.map((supplier) => (
                    <th
                      key={supplier.id}
                      className="min-w-36 border-b border-r border-slate-200 px-3 py-2 text-left text-xs font-black uppercase text-slate-500"
                    >
                      {supplierDrafts[supplier.id]?.name || supplier.name}
                    </th>
                  ))}
                  <th className="min-w-52 border-b border-r border-slate-200 px-3 py-2 text-left text-xs font-black uppercase text-slate-500">
                    Fixed Supplier
                  </th>
                  <th className="min-w-64 border-b border-slate-200 px-3 py-2 text-left text-xs font-black uppercase text-slate-500">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {routes.length === 0 ? (
                  <tr>
                    <td
                      colSpan={activeSuppliers.length + 3}
                      className="px-3 py-8 text-center text-sm font-semibold text-slate-500"
                    >
                      No routes configured yet.
                    </td>
                  </tr>
                ) : (
                  routes.map((route) => {
                    const routeDraft = routeDrafts[route.id]
                    const fixedSupplierId = routeDraft?.preferred_supplier_id || ''
                    const cheapestAmount = cheapestAmountByRoute.get(route.id) || 0
                    return (
                      <tr key={route.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-2 py-1">
                          <input
                            value={routeDraft?.route_name || ''}
                            onChange={(event) =>
                              updateRouteDraft(route.id, { route_name: event.target.value })
                            }
                            className="min-h-9 w-full rounded-md border border-transparent px-2 text-sm font-bold text-slate-900 outline-none focus:border-slate-300"
                          />
                        </td>
                        {activeSuppliers.map((supplier) => {
                          const key = selectedVehicleTypeId
                            ? rateKey(route.id, supplier.id, selectedVehicleTypeId)
                            : ''
                          const rawValue = key ? rateDrafts[key] || '' : ''
                          const amount = parseAmount(rawValue)
                          const isCheapest = cheapestAmount > 0 && amount === cheapestAmount
                          const isFixed = fixedSupplierId === supplier.id
                          return (
                            <td
                              key={supplier.id}
                              className={`border-r border-slate-200 px-2 py-1 ${
                                isCheapest ? 'bg-emerald-50' : ''
                              } ${isFixed ? 'shadow-[inset_0_0_0_2px_#8b1e2d]' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={rawValue}
                                  onChange={(event) =>
                                    updateRateDraft(route.id, supplier.id, event.target.value)
                                  }
                                  className={`min-h-9 w-24 rounded-md border px-2 text-right text-sm font-bold outline-none focus:border-slate-900 ${
                                    isCheapest
                                      ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                      : 'border-slate-200 bg-white text-slate-900'
                                  }`}
                                  placeholder="0"
                                />
                                {isCheapest && (
                                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                                )}
                              </div>
                            </td>
                          )
                        })}
                        <td className="border-r border-slate-200 px-2 py-1">
                          <select
                            value={fixedSupplierId}
                            onChange={(event) =>
                              updateRouteDraft(route.id, {
                                preferred_supplier_id: event.target.value,
                              })
                            }
                            className="min-h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm font-bold outline-none focus:border-slate-900"
                          >
                            <option value="">Not fixed</option>
                            {activeSuppliers.map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplierDrafts[supplier.id]?.name || supplier.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={routeDraft?.notes || ''}
                            onChange={(event) =>
                              updateRouteDraft(route.id, { notes: event.target.value })
                            }
                            className="min-h-9 w-full rounded-md border border-transparent px-2 text-sm text-slate-700 outline-none focus:border-slate-300"
                            placeholder="Route notes"
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs font-semibold text-slate-500">
            Green cells are the cheapest positive price for the selected vehicle type. Red outline
            marks the supplier fixed for that route.
          </p>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-950">Suppliers</p>
            <div className="mt-3 space-y-2">
              {suppliers.map((supplier) => (
                <label key={supplier.id} className="block">
                  <span className="sr-only">Supplier name</span>
                  <input
                    value={supplierDrafts[supplier.id]?.name || ''}
                    onChange={(event) =>
                      updateSupplierDraft(supplier.id, { name: event.target.value })
                    }
                    className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
                  />
                </label>
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
            <p className="text-sm font-black text-slate-950">Add Vehicle Type</p>
            <div className="mt-3 space-y-2">
              <input
                value={newVehicleLabel}
                onChange={(event) => setNewVehicleLabel(event.target.value)}
                placeholder="Vehicle label"
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <input
                value={newVehicleCapacity}
                onChange={(event) => setNewVehicleCapacity(event.target.value)}
                placeholder="Passenger capacity"
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <button
                type="button"
                onClick={() => void addVehicleType()}
                disabled={saving}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Vehicle
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-black text-slate-950">Add Route</p>
            <div className="mt-3 space-y-2">
              <input
                value={newRouteName}
                onChange={(event) => setNewRouteName(event.target.value)}
                placeholder="Route name"
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <input
                value={newRouteNotes}
                onChange={(event) => setNewRouteNotes(event.target.value)}
                placeholder="Route notes"
                className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900"
              />
              <button
                type="button"
                onClick={() => void addRoute()}
                disabled={saving}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add Route
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-black text-slate-950">Current Vehicle Summary</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Routes</span>
                <span className="font-black text-slate-950">{routes.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Suppliers</span>
                <span className="font-black text-slate-950">{activeSuppliers.length}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="font-bold text-slate-600">Edited cells</span>
                <span className="font-black text-slate-950">{dirtyRateEntries.length}</span>
              </div>
              {selectedVehicleType && (
                <div className="rounded-lg bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
                  Enter supplier net costs for {selectedVehicleType.label}. Costs are stored in SAR
                  and can be used later by the package generator as the transport net cost.
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default memo(UmrahTransportPricingTabCore)
