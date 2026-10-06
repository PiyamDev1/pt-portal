'use client'

import type { Dispatch, SetStateAction } from 'react'
import { UserPlus, X } from 'lucide-react'
import type { TravelPackagePassengerType } from '@/app/types/packages'
import type { PackageFamilyOption } from './packageOperationsModel'

export type PackagePassengerCreateForm = {
  firstName: string
  lastName: string
  dateOfBirth: string
  passengerType: TravelPackagePassengerType
}

type PackagePassengerCreatePanelProps = {
  isOpen: boolean
  onToggle: () => void
  groupFamilies: PackageFamilyOption[]
  selectedFamilyQuoteId: string
  setSelectedFamilyQuoteId: Dispatch<SetStateAction<string>>
  passengerForm: PackagePassengerCreateForm
  setPassengerForm: Dispatch<SetStateAction<PackagePassengerCreateForm>>
  onAddPassenger: () => void | Promise<void>
}

export function PackagePassengerCreatePanel({
  isOpen,
  onToggle,
  groupFamilies,
  selectedFamilyQuoteId,
  setSelectedFamilyQuoteId,
  passengerForm,
  setPassengerForm,
  onAddPassenger,
}: PackagePassengerCreatePanelProps) {
  return (
    <>
      <div className="flex flex-col gap-3 border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">Passenger list</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Quote passengers start without names. Click a name or date of birth in the table to
            enter it when documents arrive.
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 bg-[#8b1e2d] px-3 text-xs font-black text-white"
        >
          {isOpen ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {isOpen ? 'Close' : 'Add passenger'}
        </button>
      </div>

      {isOpen && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onAddPassenger()
          }}
          className="grid gap-3 border border-slate-200 bg-slate-50 p-4 md:grid-cols-5 xl:grid-cols-6"
        >
          {groupFamilies.length > 0 && (
            <label className="text-xs font-bold text-slate-600">
              Family
              <select
                value={selectedFamilyQuoteId}
                onChange={(event) => setSelectedFamilyQuoteId(event.target.value)}
                className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
                required
              >
                {groupFamilies.map((family) => (
                  <option key={family.quoteId} value={family.quoteId}>
                    {family.familyLabel}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="text-xs font-bold text-slate-600">
            First name
            <input
              value={passengerForm.firstName}
              onChange={(event) =>
                setPassengerForm((current) => ({ ...current, firstName: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Last name
            <input
              value={passengerForm.lastName}
              onChange={(event) =>
                setPassengerForm((current) => ({ ...current, lastName: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Date of birth
            <input
              type="date"
              value={passengerForm.dateOfBirth}
              onChange={(event) =>
                setPassengerForm((current) => ({ ...current, dateOfBirth: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Passenger type
            <select
              value={passengerForm.passengerType}
              onChange={(event) =>
                setPassengerForm((current) => ({
                  ...current,
                  passengerType: event.target.value as TravelPackagePassengerType,
                }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="adult">Adult</option>
              <option value="child">Child</option>
              <option value="infant">Infant under 2</option>
            </select>
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white"
          >
            <UserPlus className="h-4 w-4" />
            Add passenger
          </button>
        </form>
      )}
    </>
  )
}
