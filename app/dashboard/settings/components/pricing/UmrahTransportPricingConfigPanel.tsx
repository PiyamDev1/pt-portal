'use client'

import { useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'

import type { UmrahTransportSupplier, UmrahTransportVehicleType } from '@/app/types/pricing'

export type SupplierDraft = {
  name: string
  default_currency: string
  notes: string
}

export type VehicleDraft = {
  label: string
  passenger_capacity: string
  sort_order: number
}

export interface UmrahTransportPricingConfigModel {
  saving: boolean
  exchangeRate: {
    sarToGbp: string
    onSarToGbpChange: (value: string) => void
    damageRecoveryMode: 'percent' | 'fixed'
    onDamageRecoveryModeChange: (value: 'percent' | 'fixed') => void
    damageRecoveryValue: string
    onDamageRecoveryValueChange: (value: string) => void
  }
  suppliers: {
    items: UmrahTransportSupplier[]
    drafts: Record<string, SupplierDraft>
    onUpdate: (supplierId: string, changes: Partial<SupplierDraft>) => void
    onRemove: (supplierId: string) => Promise<void>
    onAdd: (name: string) => Promise<boolean>
  }
  vehicles: {
    items: UmrahTransportVehicleType[]
    drafts: Record<string, VehicleDraft>
    onUpdate: (vehicleTypeId: string, changes: Partial<VehicleDraft>) => void
    onReorder: (draggedVehicleId: string, targetVehicleId: string) => void
    onAdd: (label: string, passengerCapacity: string) => Promise<boolean>
  }
  summary: {
    routeSections: number
    editedRouteCells: number
    linkedRoutePrices: number
  }
}

export function UmrahTransportPricingConfigPanel({
  model,
}: {
  model: UmrahTransportPricingConfigModel
}) {
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newVehicleLabel, setNewVehicleLabel] = useState('')
  const [newVehicleCapacity, setNewVehicleCapacity] = useState('')
  const [draggingVehicleId, setDraggingVehicleId] = useState('')

  const addSupplier = async () => {
    if (await model.suppliers.onAdd(newSupplierName)) setNewSupplierName('')
  }

  const addVehicle = async () => {
    if (await model.vehicles.onAdd(newVehicleLabel, newVehicleCapacity)) {
      setNewVehicleLabel('')
      setNewVehicleCapacity('')
    }
  }

  return (
    <aside className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_18rem]">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-950">Exchange Rate</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Used to divide SAR supplier costs into GBP package net costs.
        </p>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-black uppercase text-slate-500">
            SAR per 1 GBP
          </span>
          <input
            value={model.exchangeRate.sarToGbp}
            inputMode="decimal"
            onChange={(event) => model.exchangeRate.onSarToGbpChange(event.target.value)}
            className="min-h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-black outline-none focus:border-slate-900"
            placeholder="0.00"
          />
        </label>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <p className="text-sm font-black text-slate-950">Damage Recovery Margin</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Added to package transport net costs to absorb supplier cost movement. This is not
            treated as profit.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Mode</span>
              <select
                value={model.exchangeRate.damageRecoveryMode}
                onChange={(event) =>
                  model.exchangeRate.onDamageRecoveryModeChange(
                    event.target.value === 'percent' ? 'percent' : 'fixed',
                  )
                }
                className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-black outline-none focus:border-slate-900"
              >
                <option value="fixed">Fixed GBP</option>
                <option value="percent">Percent</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-black uppercase text-slate-500">Value</span>
              <div className="flex min-h-10 items-center rounded-lg border border-slate-200 bg-white px-3">
                <span className="mr-2 text-xs font-black text-slate-500">
                  {model.exchangeRate.damageRecoveryMode === 'percent' ? '%' : 'GBP'}
                </span>
                <input
                  value={model.exchangeRate.damageRecoveryValue}
                  inputMode="decimal"
                  onChange={(event) =>
                    model.exchangeRate.onDamageRecoveryValueChange(event.target.value)
                  }
                  className="w-full bg-transparent text-sm font-black outline-none"
                  placeholder="0.00"
                />
              </div>
            </label>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-950">Suppliers</p>
        <div className="mt-3 space-y-2">
          {model.suppliers.items.map((supplier) => (
            <div key={supplier.id} className="grid grid-cols-[1fr_5rem_2.5rem] gap-2">
              <input
                aria-label={`${supplier.name} supplier name`}
                value={model.suppliers.drafts[supplier.id]?.name || ''}
                onChange={(event) =>
                  model.suppliers.onUpdate(supplier.id, { name: event.target.value })
                }
                className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold outline-none focus:border-slate-900"
              />
              <select
                aria-label={`${supplier.name} supplier currency`}
                value={model.suppliers.drafts[supplier.id]?.default_currency || 'SAR'}
                onChange={(event) =>
                  model.suppliers.onUpdate(supplier.id, {
                    default_currency: event.target.value,
                  })
                }
                className="min-h-10 rounded-lg border border-slate-200 bg-white px-2 text-sm font-black outline-none focus:border-slate-900"
              >
                <option value="SAR">SAR</option>
                <option value="GBP">GBP</option>
              </select>
              <button
                type="button"
                onClick={() => void model.suppliers.onRemove(supplier.id)}
                disabled={model.saving}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-200 text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                title="Remove supplier"
              >
                <Trash2 className="h-4 w-4" />
              </button>
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
            disabled={model.saving}
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
          {model.vehicles.items.map((vehicleType) => (
            <div
              key={vehicleType.id}
              data-testid={`vehicle-row-${vehicleType.id}`}
              draggable
              onDragStart={() => setDraggingVehicleId(vehicleType.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => model.vehicles.onReorder(draggingVehicleId, vehicleType.id)}
              onDragEnd={() => setDraggingVehicleId('')}
              className={`grid grid-cols-[2rem_1fr] gap-2 rounded-lg border p-2 ${
                draggingVehicleId === vehicleType.id
                  ? 'border-slate-400 bg-slate-50'
                  : 'border-slate-100'
              }`}
            >
              <div className="flex items-center justify-center text-slate-400">
                <GripVertical className="h-4 w-4" />
              </div>
              <div>
                <input
                  aria-label={`${vehicleType.label} vehicle label`}
                  value={model.vehicles.drafts[vehicleType.id]?.label || ''}
                  onChange={(event) =>
                    model.vehicles.onUpdate(vehicleType.id, { label: event.target.value })
                  }
                  className="min-h-9 w-full rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-slate-900"
                  placeholder="Vehicle"
                />
                <input
                  aria-label={`${vehicleType.label} passenger capacity`}
                  value={model.vehicles.drafts[vehicleType.id]?.passenger_capacity || ''}
                  onChange={(event) =>
                    model.vehicles.onUpdate(vehicleType.id, {
                      passenger_capacity: event.target.value,
                    })
                  }
                  className="mt-2 min-h-9 w-full rounded-md border border-slate-200 px-2 text-sm outline-none focus:border-slate-900"
                  placeholder="PAX"
                />
              </div>
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
            onClick={() => void addVehicle()}
            disabled={model.saving}
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
          {[
            ['Route sections', model.summary.routeSections],
            ['Suppliers', model.suppliers.items.length],
            ['Vehicle rows', model.vehicles.items.length],
            ['Edited route cells', model.summary.editedRouteCells],
            ['Linked route prices', model.summary.linkedRoutePrices],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="font-bold text-slate-600">{label}</span>
              <span className="font-black text-slate-950">{value}</span>
            </div>
          ))}
          <div className="rounded-lg bg-white p-3 text-xs font-semibold leading-5 text-slate-600">
            Green totals show the cheapest positive supplier total for that route section and
            vehicle row. Coloured bands divide supplier groups. Linked route cells reuse one stored
            route price anywhere the same A-to-B destination appears.
          </div>
        </div>
      </section>
    </aside>
  )
}
