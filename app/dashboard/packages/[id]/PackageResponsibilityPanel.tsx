'use client'

import { Loader2 } from 'lucide-react'
import type { PackageEmployeeOption, PackageLocationOption } from './packageOverviewTypes'
import { employeeLabel } from './packageOperationsModel'

export type PackageResponsibilityField = {
  label: string
  helper: string
  value: string
  bodyKey:
    | 'salesResponsibleEmployeeId'
    | 'bookingResponsibleEmployeeId'
    | 'modifyResponsibleEmployeeId'
    | 'serviceResponsibleEmployeeId'
}

type PackageResponsibilityPanelProps = {
  fields: PackageResponsibilityField[]
  employees: PackageEmployeeOption[]
  locations: PackageLocationOption[]
  selectedLocationId: string
  hasSelectedLocation: boolean
  suggestedLocation: PackageLocationOption | null
  suggestedBy: string
  saving: boolean
  onLocationChange: (locationId: string) => void
  onEmployeeChange: (bodyKey: PackageResponsibilityField['bodyKey'], employeeId: string) => void
}

export function PackageResponsibilityPanel({
  fields,
  employees,
  locations,
  selectedLocationId,
  hasSelectedLocation,
  suggestedLocation,
  suggestedBy,
  saving,
  onLocationChange,
  onEmployeeChange,
}: PackageResponsibilityPanelProps) {
  return (
    <div className="overflow-hidden border border-cyan-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-cyan-100 bg-cyan-50 px-4 py-3">
        <div>
          <p className="text-sm font-black text-cyan-950">Responsible agents</p>
          <p className="mt-1 text-xs font-semibold text-cyan-800">
            Employee ownership and the office branch responsible for this package.
          </p>
        </div>
        {saving && (
          <span className="inline-flex items-center gap-2 text-xs font-black text-cyan-900">
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving
          </span>
        )}
      </div>
      <div className="border-b border-cyan-100 bg-white px-3 py-3">
        <label className="grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-center">
          <span>
            Responsible office branch
            <span className="mt-0.5 block text-[11px] font-semibold text-slate-500">
              Office that owns this package
            </span>
          </span>
          <select
            value={selectedLocationId}
            onChange={(event) => onLocationChange(event.target.value)}
            disabled={saving || locations.length === 0}
            className="w-full border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">
              {locations.length === 0 ? 'No branches available' : 'Choose a branch'}
            </option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
                {location.branch_code ? ` (${location.branch_code})` : ''}
              </option>
            ))}
          </select>
        </label>
        {!hasSelectedLocation && suggestedLocation && (
          <p className="mt-2 text-xs font-semibold text-cyan-800">
            Suggested from {suggestedBy}: {suggestedLocation.name}
            {suggestedLocation.branch_code ? ` (${suggestedLocation.branch_code})` : ''}
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Employee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {fields.map((field) => (
              <tr key={field.bodyKey}>
                <td className="w-24 px-3 py-2 align-top">
                  <p className="font-black text-slate-950">{field.label}</p>
                  <p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">
                    {field.helper}
                  </p>
                </td>
                <td className="px-3 py-2 align-top">
                  <select
                    value={field.value}
                    onChange={(event) => onEmployeeChange(field.bodyKey, event.target.value)}
                    disabled={saving || employees.length === 0}
                    className="w-full min-w-44 border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <option value="">
                      {employees.length === 0 ? 'No employees available' : 'Not assigned'}
                    </option>
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employeeLabel(employee)}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
