/**
 * Umrah Transport Pricing Tab
 * Excel-style supplier comparison matrix for Umrah transport route packages.
 *
 * @module app/dashboard/settings/components/pricing/UmrahTransportPricingTab
 */

'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCw, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { SupabaseClient } from '@supabase/supabase-js'
import { useAppDialog } from '@/components/AppDialog'
import { UmrahTransportPricingConfigPanel } from './UmrahTransportPricingConfigPanel'
import { UmrahTransportPricingRatesPanel } from './UmrahTransportPricingRatesPanel'
import {
  guideKey,
  parseAmount,
  parseDecimal,
  rateKey,
  supplierVehicleLabelKey,
  type GuideDrafts,
  type PlanDraft,
  type RateDrafts,
  type SupplierDraft,
  type SupplierVehicleLabelDrafts,
  type VehicleDraft,
} from './umrahTransportPricingModel'
import type {
  UmrahTransportGuideRate,
  UmrahTransportRate,
  UmrahTransportRoute,
  UmrahTransportRoutePlan,
  UmrahTransportRoutePlanSegment,
  UmrahTransportSetting,
  UmrahTransportSupplier,
  UmrahTransportSupplierVehicleLabel,
  UmrahTransportVehicleType,
} from '@/app/types/pricing'

type UmrahTransportPricingTabProps = {
  supabase: SupabaseClient
}

type UmrahTransportSubTab = 'rates' | 'config'

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === 'PGRST205'
}

function UmrahTransportPricingTabCore({ supabase }: UmrahTransportPricingTabProps) {
  const { confirm, dialog } = useAppDialog()
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
  const [supplierVehicleLabelDrafts, setSupplierVehicleLabelDrafts] =
    useState<SupplierVehicleLabelDrafts>({})
  const [originalSupplierVehicleLabelDrafts, setOriginalSupplierVehicleLabelDrafts] =
    useState<SupplierVehicleLabelDrafts>({})
  const [dirtySupplierIds, setDirtySupplierIds] = useState<Set<string>>(new Set())
  const [dirtyVehicleIds, setDirtyVehicleIds] = useState<Set<string>>(new Set())
  const [dirtyPlanIds, setDirtyPlanIds] = useState<Set<string>>(new Set())
  const [activeSubTab, setActiveSubTab] = useState<UmrahTransportSubTab>('rates')
  const [sarToGbpRate, setSarToGbpRate] = useState('')
  const [originalSarToGbpRate, setOriginalSarToGbpRate] = useState('')
  const [damageRecoveryMarginMode, setDamageRecoveryMarginMode] = useState<'percent' | 'fixed'>(
    'fixed',
  )
  const [originalDamageRecoveryMarginMode, setOriginalDamageRecoveryMarginMode] = useState<
    'percent' | 'fixed'
  >('fixed')
  const [damageRecoveryMarginValue, setDamageRecoveryMarginValue] = useState('')
  const [originalDamageRecoveryMarginValue, setOriginalDamageRecoveryMarginValue] = useState('')

  const loadTransportPricing = useCallback(async () => {
    setLoading(true)
    setSchemaMissing(false)
    try {
      const [
        supplierRes,
        vehicleRes,
        routeRes,
        routePlanRes,
        planSegmentRes,
        rateRes,
        guideRes,
        supplierVehicleLabelRes,
        settingRes,
      ] = await Promise.all([
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
        supabase.from('umrah_transport_supplier_vehicle_labels').select('*'),
        supabase
          .from('umrah_transport_settings')
          .select('*')
          .in('setting_key', [
            'sar_to_gbp_exchange_rate',
            'damage_recovery_margin_mode',
            'damage_recovery_margin_value',
          ]),
      ])

      const firstError =
        supplierRes.error ||
        vehicleRes.error ||
        routeRes.error ||
        routePlanRes.error ||
        planSegmentRes.error ||
        rateRes.error ||
        guideRes.error ||
        supplierVehicleLabelRes.error ||
        settingRes.error
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
      const nextSupplierVehicleLabels = (supplierVehicleLabelRes.data ||
        []) as UmrahTransportSupplierVehicleLabel[]
      const nextSettings = (settingRes.data || []) as UmrahTransportSetting[]
      const exchangeRateSetting = nextSettings.find(
        (setting) => setting.setting_key === 'sar_to_gbp_exchange_rate',
      )
      const damageRecoveryMarginModeSetting = nextSettings.find(
        (setting) => setting.setting_key === 'damage_recovery_margin_mode',
      )
      const damageRecoveryMarginValueSetting = nextSettings.find(
        (setting) => setting.setting_key === 'damage_recovery_margin_value',
      )
      const nextDamageRecoveryMarginMode =
        damageRecoveryMarginModeSetting?.setting_value === 'percent' ? 'percent' : 'fixed'

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
            sort_order: vehicleType.sort_order,
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
      const nextSupplierVehicleLabelDrafts: SupplierVehicleLabelDrafts = {}
      nextSupplierVehicleLabels.forEach((label) => {
        nextSupplierVehicleLabelDrafts[
          supplierVehicleLabelKey(label.supplier_id, label.vehicle_type_id)
        ] = label.transport_label ?? ''
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
      setSupplierVehicleLabelDrafts(nextSupplierVehicleLabelDrafts)
      setOriginalSupplierVehicleLabelDrafts(nextSupplierVehicleLabelDrafts)
      setSarToGbpRate(exchangeRateSetting?.setting_value || '')
      setOriginalSarToGbpRate(exchangeRateSetting?.setting_value || '')
      setDamageRecoveryMarginMode(nextDamageRecoveryMarginMode)
      setOriginalDamageRecoveryMarginMode(nextDamageRecoveryMarginMode)
      setDamageRecoveryMarginValue(damageRecoveryMarginValueSetting?.setting_value || '')
      setOriginalDamageRecoveryMarginValue(damageRecoveryMarginValueSetting?.setting_value || '')
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

  const activeRoutePlans = useMemo(() => routePlans.filter((plan) => plan.is_active), [routePlans])

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

  const routeUsageCountById = useMemo(() => {
    const result = new Map<string, number>()
    activeRoutePlans.forEach((plan) => {
      const segments = segmentsByPlanId.get(plan.id) || []
      segments.forEach((segment) => {
        result.set(segment.route_id, (result.get(segment.route_id) || 0) + 1)
      })
    })
    return result
  }, [activeRoutePlans, segmentsByPlanId])

  const linkedRouteCount = useMemo(() => {
    return Array.from(routeUsageCountById.values()).filter((usageCount) => usageCount > 1).length
  }, [routeUsageCountById])

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

  const dirtySupplierVehicleLabelEntries = useMemo(() => {
    return Object.entries(supplierVehicleLabelDrafts).filter(
      ([key, value]) =>
        String(value || '') !== String(originalSupplierVehicleLabelDrafts[key] || ''),
    )
  }, [originalSupplierVehicleLabelDrafts, supplierVehicleLabelDrafts])

  const hasUnsavedChanges =
    dirtySupplierIds.size > 0 ||
    dirtyVehicleIds.size > 0 ||
    dirtyPlanIds.size > 0 ||
    dirtyRateEntries.length > 0 ||
    dirtyGuideEntries.length > 0 ||
    dirtySupplierVehicleLabelEntries.length > 0 ||
    sarToGbpRate !== originalSarToGbpRate ||
    damageRecoveryMarginMode !== originalDamageRecoveryMarginMode ||
    damageRecoveryMarginValue !== originalDamageRecoveryMarginValue

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
        ...(current[vehicleTypeId] || { label: '', passenger_capacity: '', sort_order: 0 }),
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

  const updateSupplierVehicleLabelDraft = (
    supplierId: string,
    vehicleTypeId: string,
    value: string,
  ) => {
    setSupplierVehicleLabelDrafts((current) => ({
      ...current,
      [supplierVehicleLabelKey(supplierId, vehicleTypeId)]: value,
    }))
  }

  const reorderVehicleTypes = (draggedVehicleId: string, targetVehicleId: string) => {
    if (!draggedVehicleId || draggedVehicleId === targetVehicleId) return
    const activeVehicles = vehicleTypes.filter((vehicleType) => vehicleType.is_active)
    const inactiveVehicles = vehicleTypes.filter((vehicleType) => !vehicleType.is_active)
    const draggedIndex = activeVehicles.findIndex(
      (vehicleType) => vehicleType.id === draggedVehicleId,
    )
    const targetIndex = activeVehicles.findIndex(
      (vehicleType) => vehicleType.id === targetVehicleId,
    )
    if (draggedIndex < 0 || targetIndex < 0) return

    const reordered = [...activeVehicles]
    const [draggedVehicle] = reordered.splice(draggedIndex, 1)
    reordered.splice(targetIndex, 0, draggedVehicle)
    const orderedActiveVehicles = reordered.map((vehicleType, index) => ({
      ...vehicleType,
      sort_order: (index + 1) * 10,
    }))
    const changedIds = orderedActiveVehicles.map((vehicleType) => vehicleType.id)

    setVehicleTypes([...orderedActiveVehicles, ...inactiveVehicles])
    setVehicleDrafts((current) => {
      const next = { ...current }
      orderedActiveVehicles.forEach((vehicleType) => {
        next[vehicleType.id] = {
          ...(next[vehicleType.id] || {
            label: vehicleType.label,
            passenger_capacity: vehicleType.passenger_capacity || '',
            sort_order: vehicleType.sort_order,
          }),
          sort_order: vehicleType.sort_order,
        }
      })
      return next
    })
    setDirtyVehicleIds((current) => {
      const next = new Set(current)
      changedIds.forEach((id) => next.add(id))
      return next
    })
  }

  const getSupplierCurrency = useCallback(
    (supplierId: string) => supplierDrafts[supplierId]?.default_currency || 'SAR',
    [supplierDrafts],
  )

  const addSupplier = async (supplierName: string): Promise<boolean> => {
    const name = supplierName.trim()
    if (!name) {
      toast.error('Supplier name is required')
      return false
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
      toast.success('Supplier added')
      await loadTransportPricing()
      return true
    } catch (error) {
      console.error('[UmrahTransportPricingTab] Failed to add supplier:', error)
      toast.error('Failed to add supplier')
      return false
    } finally {
      setSaving(false)
    }
  }

  const removeSupplier = async (supplierId: string) => {
    const supplierName = supplierDrafts[supplierId]?.name || 'this supplier'
    const shouldRemove = await confirm({
      title: 'Remove transport supplier?',
      message: `Remove ${supplierName} from active transport pricing?`,
      confirmLabel: 'Remove supplier',
      type: 'danger',
    })
    if (!shouldRemove) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('umrah_transport_suppliers')
        .update({ is_active: false })
        .eq('id', supplierId)
      if (error) throw error
      toast.success('Supplier removed')
      await loadTransportPricing()
    } catch (error) {
      console.error('[UmrahTransportPricingTab] Failed to remove supplier:', error)
      toast.error('Failed to remove supplier')
    } finally {
      setSaving(false)
    }
  }

  const addVehicleType = async (
    vehicleLabel: string,
    passengerCapacity: string,
  ): Promise<boolean> => {
    const label = vehicleLabel.trim()
    if (!label) {
      toast.error('Vehicle type is required')
      return false
    }
    setSaving(true)
    try {
      const { error } = await supabase.from('umrah_transport_vehicle_types').insert({
        label,
        passenger_capacity: passengerCapacity.trim() || null,
        sort_order: (vehicleTypes.length + 1) * 10,
        is_active: true,
      })
      if (error) throw error
      toast.success('Vehicle type added')
      await loadTransportPricing()
      return true
    } catch (error) {
      console.error('[UmrahTransportPricingTab] Failed to add vehicle type:', error)
      toast.error('Failed to add vehicle type')
      return false
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
            sort_order: draft?.sort_order || 0,
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
      const supplierVehicleLabelRows = dirtySupplierVehicleLabelEntries
        .map(([key, value]) => {
          const [supplierId, vehicleTypeId] = key.split(':')
          if (!supplierId || !vehicleTypeId) return null
          return {
            supplier_id: supplierId,
            vehicle_type_id: vehicleTypeId,
            transport_label: value,
            is_active: true,
          }
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
      const exchangeRateChanged = sarToGbpRate !== originalSarToGbpRate
      const damageRecoveryMarginChanged =
        damageRecoveryMarginMode !== originalDamageRecoveryMarginMode ||
        damageRecoveryMarginValue !== originalDamageRecoveryMarginValue

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

      if (supplierVehicleLabelRows.length > 0) {
        const { error } = await supabase
          .from('umrah_transport_supplier_vehicle_labels')
          .upsert(supplierVehicleLabelRows, { onConflict: 'supplier_id,vehicle_type_id' })
        if (error) throw error
      }

      if (exchangeRateChanged) {
        const { error } = await supabase.from('umrah_transport_settings').upsert(
          {
            setting_key: 'sar_to_gbp_exchange_rate',
            setting_value: String(parseDecimal(sarToGbpRate, 6)),
            notes: 'Global transport pricing exchange rate. Enter SAR per 1 GBP.',
          },
          { onConflict: 'setting_key' },
        )
        if (error) throw error
      }

      if (damageRecoveryMarginChanged) {
        const { error } = await supabase.from('umrah_transport_settings').upsert(
          [
            {
              setting_key: 'damage_recovery_margin_mode',
              setting_value: damageRecoveryMarginMode,
              notes: 'Damage recovery margin mode applied to package transport net costs.',
            },
            {
              setting_key: 'damage_recovery_margin_value',
              setting_value: String(parseDecimal(damageRecoveryMarginValue, 2)),
              notes: 'Damage recovery margin value applied to package transport net costs.',
            },
          ],
          { onConflict: 'setting_key' },
        )
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
      {dialog}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950">Umrah Transport Rates</h3>
            <p className="mt-1 max-w-4xl text-sm text-slate-600">
              Enter supplier costs in route blocks. Totals are calculated per supplier and vehicle,
              cheapest totals are highlighted, and the fixed supplier per route is used later for
              package transport net costs. Repeated A-to-B destinations are linked, so editing one
              route cost updates every matching route-plan cell.
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

      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveSubTab('rates')}
          className={`rounded-md px-3 py-1.5 text-sm font-black transition ${
            activeSubTab === 'rates'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          Rates
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('config')}
          className={`rounded-md px-3 py-1.5 text-sm font-black transition ${
            activeSubTab === 'config'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          Config
        </button>
      </div>

      {activeSubTab === 'rates' ? (
        <UmrahTransportPricingRatesPanel
          model={{
            plans: activeRoutePlans,
            segmentsByPlanId,
            routes,
            routeUsageCountById,
            suppliers: activeSuppliers,
            supplierDrafts,
            vehicles: activeVehicleTypes,
            vehicleDrafts,
            planDrafts,
            rateDrafts,
            guideDrafts,
            supplierVehicleLabelDrafts,
            onUpdatePlan: updatePlanDraft,
            onUpdateVehicle: updateVehicleDraft,
            onUpdateRate: updateRateDraft,
            onUpdateGuide: updateGuideDraft,
            onUpdateSupplierVehicleLabel: updateSupplierVehicleLabelDraft,
          }}
        />
      ) : (
        <UmrahTransportPricingConfigPanel
          model={{
            saving,
            exchangeRate: {
              sarToGbp: sarToGbpRate,
              onSarToGbpChange: setSarToGbpRate,
              damageRecoveryMode: damageRecoveryMarginMode,
              onDamageRecoveryModeChange: setDamageRecoveryMarginMode,
              damageRecoveryValue: damageRecoveryMarginValue,
              onDamageRecoveryValueChange: setDamageRecoveryMarginValue,
            },
            suppliers: {
              items: activeSuppliers,
              drafts: supplierDrafts,
              onUpdate: updateSupplierDraft,
              onRemove: removeSupplier,
              onAdd: addSupplier,
            },
            vehicles: {
              items: activeVehicleTypes,
              drafts: vehicleDrafts,
              onUpdate: updateVehicleDraft,
              onReorder: reorderVehicleTypes,
              onAdd: addVehicleType,
            },
            summary: {
              routeSections: activeRoutePlans.length,
              editedRouteCells: dirtyRateEntries.length,
              linkedRoutePrices: linkedRouteCount,
            },
          }}
        />
      )}
    </div>
  )
}

export default memo(UmrahTransportPricingTabCore)
