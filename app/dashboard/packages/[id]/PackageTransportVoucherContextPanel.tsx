'use client'

import type { TravelPackageTransportVoucherData } from '@/app/types/packages'

type PackageVoucherRouteAssignment = NonNullable<
  TravelPackageTransportVoucherData['routeAssignments']
>[number]

type PackageTransportVoucherContextPanelProps = {
  selectedVoucherVersion: number | null
  routeAssignments: PackageVoucherRouteAssignment[]
  onStartFromFinalQuote: () => void
  onRebuildItinerary: () => void
}

export function PackageTransportVoucherContextPanel({
  selectedVoucherVersion,
  routeAssignments,
  onStartFromFinalQuote,
  onRebuildItinerary,
}: PackageTransportVoucherContextPanelProps) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="text-sm font-black text-slate-900">Dynamic Transport Voucher</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Final quote details are prefilled. Complete flight, landing, transport provider, driver,
            and route timings before releasing.
          </p>
          <p className="mt-1 text-xs font-bold text-slate-600">
            {selectedVoucherVersion !== null
              ? `Editing voucher v${selectedVoucherVersion}`
              : 'Creating a new voucher from the final quote'}
          </p>
        </div>
        <button
          type="button"
          onClick={onStartFromFinalQuote}
          className="border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"
        >
          New voucher from final quote
        </button>
      </div>

      {routeAssignments.length > 0 && (
        <div className="border border-emerald-200 bg-emerald-50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase text-emerald-900">
                Route data from final quote
              </p>
              <p className="mt-1 text-xs font-semibold text-emerald-800">
                Vehicle details are shown per route. Route pricing supplier and cost details stay
                internal for operations.
              </p>
            </div>
            <button
              type="button"
              onClick={onRebuildItinerary}
              className="border border-emerald-300 bg-white px-3 py-2 text-xs font-black text-emerald-900"
            >
              Rebuild itinerary rows
            </button>
          </div>
          <div className="mt-3 grid gap-2 lg:grid-cols-2">
            {routeAssignments.map((route, index) => (
              <div key={`${route.routeName}-${index}`} className="bg-white p-3 text-xs">
                <p className="font-black text-slate-900">
                  {index + 1}. {route.routeName || 'Route to confirm'}
                </p>
                <p className="mt-1 font-semibold text-slate-500">
                  {route.type || 'Transport Segment'}
                  {route.vehicleType ? ` · ${route.vehicleType}` : ''}
                  {route.supplierName ? ` · ${route.supplierName}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
