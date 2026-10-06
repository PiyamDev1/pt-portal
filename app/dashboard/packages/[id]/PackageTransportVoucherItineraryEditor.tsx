'use client'

import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import type { TravelPackageTransportVoucherData } from '@/app/types/packages'
import { TRANSPORT_VEHICLES } from './packageOperationsModel'

type VoucherItineraryItem = NonNullable<TravelPackageTransportVoucherData['itinerary']>[number]
type VoucherRouteAssignment = NonNullable<
  TravelPackageTransportVoucherData['routeAssignments']
>[number]

type PackageTransportVoucherItineraryEditorProps = {
  itinerary: VoucherItineraryItem[]
  routeAssignments: VoucherRouteAssignment[]
  defaultVehicleType: string
  onUpdateItem: (index: number, updates: Partial<VoucherItineraryItem>) => void
  onUpdateVehicle: (index: number, vehicleType: string) => void
  onAddItem: (type: string) => void
  onRemoveItem: (index: number) => void
  onMoveItem: (fromIndex: number, toIndex: number) => void
}

export function PackageTransportVoucherItineraryEditor({
  itinerary,
  routeAssignments,
  defaultVehicleType,
  onUpdateItem,
  onUpdateVehicle,
  onAddItem,
  onRemoveItem,
  onMoveItem,
}: PackageTransportVoucherItineraryEditorProps) {
  const [draggedSegmentIndex, setDraggedSegmentIndex] = useState<number | null>(null)

  return (
    <div className="flex flex-col border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-black text-slate-900">Itinerary Builder</h3>
      <div className="mt-3 max-h-[34rem] space-y-3 overflow-y-auto pr-1">
        {itinerary.map((item, index) => (
          <div
            key={index}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (draggedSegmentIndex !== null) onMoveItem(draggedSegmentIndex, index)
              setDraggedSegmentIndex(null)
            }}
            className={`space-y-2 border bg-white p-3 transition ${
              draggedSegmentIndex === index
                ? 'border-cyan-500 bg-cyan-50 opacity-70'
                : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    setDraggedSegmentIndex(index)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', String(index))
                  }}
                  onDragEnd={() => setDraggedSegmentIndex(null)}
                  className="inline-flex h-8 w-8 shrink-0 cursor-grab items-center justify-center border border-slate-200 bg-slate-50 text-slate-500 active:cursor-grabbing"
                  title="Drag to reorder segment"
                  aria-label={`Reorder segment ${index + 1}`}
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <p className="truncate text-xs font-black text-slate-700">
                  Segment #{index + 1}: {item.type || 'Transport Segment'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemoveItem(index)}
                className="text-xs font-black text-red-600"
              >
                Remove
              </button>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-bold uppercase text-slate-500">
                Segment type
                <input
                  value={item.type}
                  onChange={(event) => onUpdateItem(index, { type: event.target.value })}
                  placeholder="Airport Pickup"
                  className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
                />
              </label>
              <label className="text-[11px] font-bold uppercase text-slate-500">
                Vehicle for this segment
                <select
                  value={routeAssignments[index]?.vehicleType || defaultVehicleType || ''}
                  onChange={(event) => onUpdateVehicle(index, event.target.value)}
                  className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm normal-case text-slate-900"
                >
                  <option value="">To be confirmed</option>
                  {TRANSPORT_VEHICLES.map((vehicle) => (
                    <option key={vehicle.name} value={vehicle.name}>
                      {vehicle.name}
                    </option>
                  ))}
                  {routeAssignments[index]?.vehicleType &&
                    !TRANSPORT_VEHICLES.some(
                      (vehicle) => vehicle.name === routeAssignments[index]?.vehicleType,
                    ) && (
                      <option value={routeAssignments[index]?.vehicleType || ''}>
                        {routeAssignments[index]?.vehicleType}
                      </option>
                    )}
                </select>
              </label>
            </div>

            <input
              value={item.description}
              onChange={(event) => onUpdateItem(index, { description: event.target.value })}
              placeholder="JED Airport to Makkah Hotel"
              className="w-full border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={item.date}
                onChange={(event) => onUpdateItem(index, { date: event.target.value })}
                className="border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={item.time}
                onChange={(event) => onUpdateItem(index, { time: event.target.value })}
                className="border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        ))}
        {itinerary.length === 0 && (
          <p className="border border-dashed border-slate-300 bg-white p-4 text-center text-sm font-bold text-slate-500">
            No itinerary segments yet.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => onAddItem("Ziyara'at / Tour")}
          className="bg-blue-100 p-2 text-xs font-black text-blue-800"
        >
          Add Ziyara&apos;at
        </button>
        <button
          type="button"
          onClick={() => onAddItem('Hotel Transfer')}
          className="bg-emerald-100 p-2 text-xs font-black text-emerald-800"
        >
          Add Hotel Transfer
        </button>
        <button
          type="button"
          onClick={() => onAddItem('Return Transfer')}
          className="col-span-2 bg-slate-200 p-2 text-xs font-black text-slate-800"
        >
          Add Return to Airport
        </button>
      </div>
    </div>
  )
}
