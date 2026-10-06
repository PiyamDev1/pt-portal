'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Save, Trash2, X } from 'lucide-react'
import type { TravelPackagePassenger, TravelPackagePassengerType } from '@/app/types/packages'
import { dateInput, label, type PackageFamilyOption } from './packageOperationsModel'

export type PackagePassengerEditForm = {
  firstName: string
  lastName: string
  dateOfBirth: string
  passengerType: TravelPackagePassengerType
  roomAllocation: string
  internalNotes: string
}

type PackagePassengerTableProps = {
  passengers: TravelPackagePassenger[]
  groupFamilies: PackageFamilyOption[]
  editingPassengerId: string | null
  passengerEditForm: PackagePassengerEditForm
  setPassengerEditForm: Dispatch<SetStateAction<PackagePassengerEditForm>>
  saving: string | null
  onStartPassengerEdit: (passenger: TravelPackagePassenger) => void
  onSavePassengerEdit: (passenger: TravelPackagePassenger) => void | Promise<void>
  onCancelPassengerEdit: () => void
  onUpdatePassenger: (
    passenger: TravelPackagePassenger,
    body: Record<string, unknown>,
  ) => boolean | Promise<boolean>
  onDeletePassenger: (passenger: TravelPackagePassenger) => void | Promise<void>
}

export function PackagePassengerTable({
  passengers,
  groupFamilies,
  editingPassengerId,
  passengerEditForm,
  setPassengerEditForm,
  saving,
  onStartPassengerEdit,
  onSavePassengerEdit,
  onCancelPassengerEdit,
  onUpdatePassenger,
  onDeletePassenger,
}: PackagePassengerTableProps) {
  return (
    <div className="overflow-x-auto border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Passenger</th>
            {groupFamilies.length > 0 && <th className="px-3 py-2">Family</th>}
            <th className="px-3 py-2">Date of birth</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Passport received</th>
            <th className="px-3 py-2">Checked</th>
            <th className="px-3 py-2">Visa</th>
            <th className="px-3 py-2">Ticket</th>
            <th className="px-3 py-2">Room / Notes</th>
            <th className="w-24 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {passengers.map((passenger) => {
            const editingThisPassenger = editingPassengerId === passenger.id
            return (
              <tr key={passenger.id}>
                <td className="min-w-56 px-3 py-2 font-bold">
                  {editingThisPassenger ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={passengerEditForm.firstName}
                        onChange={(event) =>
                          setPassengerEditForm((current) => ({
                            ...current,
                            firstName: event.target.value,
                          }))
                        }
                        placeholder="First name"
                        className="w-full border border-slate-300 px-2 py-1 text-xs"
                      />
                      <input
                        value={passengerEditForm.lastName}
                        onChange={(event) =>
                          setPassengerEditForm((current) => ({
                            ...current,
                            lastName: event.target.value,
                          }))
                        }
                        placeholder="Last name"
                        className="w-full border border-slate-300 px-2 py-1 text-xs"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartPassengerEdit(passenger)}
                      className="w-full rounded border border-transparent px-2 py-1 text-left font-bold transition hover:border-cyan-200 hover:bg-cyan-50"
                      title="Click to edit passenger name"
                    >
                      {[passenger.first_name, passenger.last_name].filter(Boolean).join(' ') ||
                        'Click to add name'}
                    </button>
                  )}
                </td>
                {groupFamilies.length > 0 && (
                  <td className="min-w-36 px-3 py-2">
                    <span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-black text-cyan-900">
                      {passenger.quote_id
                        ? groupFamilies.find((family) => family.quoteId === passenger.quote_id)
                            ?.familyLabel || 'Unallocated'
                        : 'Unallocated'}
                    </span>
                  </td>
                )}
                <td className="min-w-36 px-3 py-2">
                  {editingThisPassenger ? (
                    <input
                      type="date"
                      value={passengerEditForm.dateOfBirth}
                      onChange={(event) =>
                        setPassengerEditForm((current) => ({
                          ...current,
                          dateOfBirth: event.target.value,
                        }))
                      }
                      className="w-full border border-slate-300 px-2 py-1 text-xs"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onStartPassengerEdit(passenger)}
                      className="w-full rounded border border-transparent px-2 py-1 text-left transition hover:border-cyan-200 hover:bg-cyan-50"
                      title="Click to edit date of birth"
                    >
                      {dateInput(passenger.date_of_birth) || 'Click to add DOB'}
                    </button>
                  )}
                </td>
                <td className="min-w-32 px-3 py-2">
                  {editingThisPassenger ? (
                    <select
                      value={passengerEditForm.passengerType}
                      onChange={(event) =>
                        setPassengerEditForm((current) => ({
                          ...current,
                          passengerType: event.target.value as TravelPackagePassengerType,
                        }))
                      }
                      className="w-full border border-slate-300 px-2 py-1 text-xs"
                    >
                      <option value="adult">Adult</option>
                      <option value="child">Child</option>
                      <option value="infant">Infant under 2</option>
                    </select>
                  ) : (
                    label(passenger.passenger_type)
                  )}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={passenger.passport_received}
                    onChange={(event) =>
                      void onUpdatePassenger(passenger, {
                        passportReceived: event.target.checked,
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={passenger.passport_checked}
                    onChange={(event) =>
                      void onUpdatePassenger(passenger, {
                        passportChecked: event.target.checked,
                      })
                    }
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={passenger.visa_status}
                    onChange={(event) =>
                      void onUpdatePassenger(passenger, { visaStatus: event.target.value })
                    }
                    className="border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="not_started">Not started</option>
                    <option value="details_required">Details required</option>
                    <option value="submitted">Submitted</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="not_required">Not required</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <select
                    value={passenger.ticket_status}
                    onChange={(event) =>
                      void onUpdatePassenger(passenger, { ticketStatus: event.target.value })
                    }
                    className="border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="not_started">Not started</option>
                    <option value="held">Held</option>
                    <option value="ticketed">Ticketed</option>
                    <option value="changed">Changed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </td>
                <td className="min-w-64 px-3 py-2">
                  {editingThisPassenger ? (
                    <div className="space-y-2">
                      <input
                        value={passengerEditForm.roomAllocation}
                        onChange={(event) =>
                          setPassengerEditForm((current) => ({
                            ...current,
                            roomAllocation: event.target.value,
                          }))
                        }
                        placeholder="Room allocation"
                        className="w-full border border-slate-300 px-2 py-1 text-xs"
                      />
                      <textarea
                        value={passengerEditForm.internalNotes}
                        onChange={(event) =>
                          setPassengerEditForm((current) => ({
                            ...current,
                            internalNotes: event.target.value,
                          }))
                        }
                        placeholder="Internal notes"
                        rows={2}
                        className="w-full border border-slate-300 px-2 py-1 text-xs"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1 text-xs text-slate-600">
                      <p className="font-bold">
                        {passenger.room_allocation || 'Room not allocated'}
                      </p>
                      {passenger.internal_notes && (
                        <p className="whitespace-pre-line">{passenger.internal_notes}</p>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {editingThisPassenger ? (
                      <>
                        <button
                          title="Save passenger"
                          onClick={() => void onSavePassengerEdit(passenger)}
                          disabled={saving === passenger.id}
                          className="p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          title="Cancel edit"
                          onClick={onCancelPassengerEdit}
                          disabled={saving === passenger.id}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        title="Edit passenger"
                        onClick={() => onStartPassengerEdit(passenger)}
                        className="p-1.5 text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      title="Delete passenger"
                      onClick={() => void onDeletePassenger(passenger)}
                      disabled={saving === passenger.id}
                      className="p-1.5 text-red-600 hover:bg-red-50 disabled:text-slate-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {passengers.length === 0 && (
        <p className="p-5 text-center text-sm text-slate-500">No passenger records yet.</p>
      )}
    </div>
  )
}
