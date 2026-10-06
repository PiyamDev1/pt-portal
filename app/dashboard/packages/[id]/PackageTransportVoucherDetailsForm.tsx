'use client'

import type { TravelPackageTransportVoucherData } from '@/app/types/packages'
import { dateTimeInput, TRANSPORT_VEHICLES } from './packageOperationsModel'

type VoucherFieldUpdater = <Key extends keyof TravelPackageTransportVoucherData>(
  key: Key,
  value: TravelPackageTransportVoucherData[Key],
) => void

type PackageTransportVoucherDetailsFormProps = {
  voucherForm: TravelPackageTransportVoucherData
  passengerError: string
  onUpdateField: VoucherFieldUpdater
  onVehicleChange: (vehicleType: string) => void
  onProviderNameChange: (providerName: string) => void
  onProviderContactChange: (providerContact: string) => void
}

export function PackageTransportVoucherDetailsForm({
  voucherForm,
  passengerError,
  onUpdateField,
  onVehicleChange,
  onProviderNameChange,
  onProviderContactChange,
}: PackageTransportVoucherDetailsFormProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-600">
          Vehicle type
          <select
            value={voucherForm.vehicle || voucherForm.vehicleType || 'H1'}
            onChange={(event) => onVehicleChange(event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          >
            {TRANSPORT_VEHICLES.map((vehicle) => (
              <option key={vehicle.name} value={vehicle.name}>
                {vehicle.name} ({vehicle.passengers} pax, {vehicle.bags} bags)
              </option>
            ))}
            {voucherForm.vehicle &&
              !TRANSPORT_VEHICLES.some((item) => item.name === voucherForm.vehicle) && (
                <option value={voucherForm.vehicle}>{voucherForm.vehicle}</option>
              )}
          </select>
        </label>
        <label className="text-xs font-bold text-slate-600">
          Max bags
          <input
            value={voucherForm.maxBags || ''}
            onChange={(event) => onUpdateField('maxBags', event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Extra baggage fee
          <input
            value={voucherForm.extraBaggageFee || ''}
            onChange={(event) => onUpdateField('extraBaggageFee', event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-600">
          Adults
          <input
            type="number"
            min="0"
            value={voucherForm.adults || 0}
            onChange={(event) => onUpdateField('adults', Number(event.target.value))}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Children
          <input
            type="number"
            min="0"
            value={voucherForm.children || 0}
            onChange={(event) => onUpdateField('children', Number(event.target.value))}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Infants
          <input
            type="number"
            min="0"
            value={voucherForm.infants || 0}
            onChange={(event) => onUpdateField('infants', Number(event.target.value))}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        {passengerError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 md:col-span-3">
            {passengerError}
          </p>
        )}
      </div>

      <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-600">
          Booking ID
          <input
            value={voucherForm.bookingId || ''}
            onChange={(event) => onUpdateField('bookingId', event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Flight number
          <input
            value={voucherForm.flightNumber || ''}
            onChange={(event) => onUpdateField('flightNumber', event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Airports
          <input
            value={voucherForm.airports || ''}
            onChange={(event) => onUpdateField('airports', event.target.value)}
            placeholder="LHR to JED"
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">
            Landing date
            <input
              type="date"
              value={voucherForm.landingDate || ''}
              onChange={(event) => onUpdateField('landingDate', event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-bold text-slate-600">
            Landing time
            <input
              type="time"
              value={voucherForm.landingTime || ''}
              onChange={(event) => onUpdateField('landingTime', event.target.value)}
              className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="text-xs font-bold text-slate-600">
          Transport provider name
          <input
            value={voucherForm.providerName || voucherForm.transportCompany || ''}
            onChange={(event) => onProviderNameChange(event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Transport provider contact
          <input
            value={voucherForm.providerContact || voucherForm.groundManager || ''}
            onChange={(event) => onProviderContactChange(event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-600">
          Makkah hotel
          <input
            value={voucherForm.makkahHotel}
            onChange={(event) => onUpdateField('makkahHotel', event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Madinah hotel
          <input
            value={voucherForm.madinahHotel}
            onChange={(event) => onUpdateField('madinahHotel', event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Driver contact
          <input
            value={voucherForm.driverContact}
            onChange={(event) => onUpdateField('driverContact', event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Departure date/time
          <input
            type="datetime-local"
            value={dateTimeInput(voucherForm.departureAt)}
            onChange={(event) => onUpdateField('departureAt', event.target.value)}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="grid gap-3 border-t border-slate-200 pt-3 md:grid-cols-2">
        <label className="text-xs font-bold text-slate-600">
          Customer note
          <textarea
            value={voucherForm.publicNotes}
            onChange={(event) => onUpdateField('publicNotes', event.target.value)}
            rows={3}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="text-xs font-bold text-slate-600">
          Internal note
          <textarea
            value={voucherForm.internalNotes}
            onChange={(event) => onUpdateField('internalNotes', event.target.value)}
            rows={3}
            className="mt-1 w-full border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
      </div>
    </div>
  )
}
