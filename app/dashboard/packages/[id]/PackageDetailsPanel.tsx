'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Loader2, Save } from 'lucide-react'
import type { TravelPackageFolderStatus } from '@/app/types/packages'
import {
  PASSPORT_STATUSES,
  formatDateTime,
  label,
  packageStatusLabel,
} from './packageOperationsModel'

export type PackageCustomerDetailsForm = {
  customerName: string
  customerPhone: string
  customerEmail: string
  destination: string
  departureDate: string
  returnDate: string
}

type PackageDetailsPanelProps = {
  status: TravelPackageFolderStatus
  passportStatus: string
  availableStatuses: TravelPackageFolderStatus[]
  nextAction: string | null
  nextActionDueAt: string | null
  customerForm: PackageCustomerDetailsForm
  setCustomerForm: Dispatch<SetStateAction<PackageCustomerDetailsForm>>
  saving: boolean
  onStatusChange: (status: TravelPackageFolderStatus) => void
  onPassportStatusChange: (status: string) => void
  onSaveCustomerDetails: (form: PackageCustomerDetailsForm) => void | Promise<void>
}

export function PackageDetailsPanel({
  status,
  passportStatus,
  availableStatuses,
  nextAction,
  nextActionDueAt,
  customerForm,
  setCustomerForm,
  saving,
  onStatusChange,
  onPassportStatusChange,
  onSaveCustomerDetails,
}: PackageDetailsPanelProps) {
  return (
    <div className="border border-slate-200 bg-white">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm font-black text-slate-950">Package details</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          Status, dates, and customer contact information.
        </p>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="block text-xs font-bold text-slate-600">
            Lifecycle status
            <select
              value={status}
              onChange={(event) => onStatusChange(event.target.value as TravelPackageFolderStatus)}
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {availableStatuses.map((availableStatus) => (
                <option key={availableStatus} value={availableStatus}>
                  {packageStatusLabel(availableStatus)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-bold text-slate-600">
            Passport status
            <select
              value={passportStatus}
              onChange={(event) => onPassportStatusChange(event.target.value)}
              className="mt-1 w-full border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {PASSPORT_STATUSES.map((availableStatus) => (
                <option key={availableStatus} value={availableStatus}>
                  {label(availableStatus)}
                </option>
              ))}
            </select>
          </label>
          <div className="border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase text-slate-500">Next action</p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {nextAction || 'Review package'}
            </p>
            {nextActionDueAt && (
              <p className="mt-1 text-xs text-slate-500">Due {formatDateTime(nextActionDueAt)}</p>
            )}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault()
            void onSaveCustomerDetails(customerForm)
          }}
          className="grid gap-3 md:grid-cols-3"
        >
          <label className="text-xs font-bold text-slate-600">
            Lead customer
            <input
              value={customerForm.customerName}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, customerName: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Phone
            <input
              value={customerForm.customerPhone}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, customerPhone: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Email
            <input
              type="email"
              value={customerForm.customerEmail}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, customerEmail: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Destination
            <input
              value={customerForm.destination}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, destination: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Departure
            <input
              type="date"
              value={customerForm.departureDate}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, departureDate: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Return
            <input
              type="date"
              value={customerForm.returnDate}
              onChange={(event) =>
                setCustomerForm((current) => ({ ...current, returnDate: event.target.value }))
              }
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 bg-slate-900 px-3 py-2 text-xs font-black text-white md:col-span-3 md:justify-self-start disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save package details
          </button>
        </form>
      </div>
    </div>
  )
}
