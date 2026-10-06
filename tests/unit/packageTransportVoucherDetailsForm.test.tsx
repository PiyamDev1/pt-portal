import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TravelPackageTransportVoucherData } from '@/app/types/packages'
import { PackageTransportVoucherDetailsForm } from '@/app/dashboard/packages/[id]/PackageTransportVoucherDetailsForm'

const voucherForm: TravelPackageTransportVoucherData = {
  arrivalAirport: 'JED',
  arrivalAt: '',
  departureAirport: '',
  departureAt: '',
  makkahHotel: '',
  madinahHotel: '',
  routes: [],
  vehicleType: 'H1',
  transportCompany: '',
  driverContact: '',
  groundManager: '',
  publicNotes: '',
  internalNotes: '',
  adults: 2,
}

describe('PackageTransportVoucherDetailsForm', () => {
  it('delegates field updates and vehicle changes to its workspace owner', () => {
    const onUpdateField = vi.fn()
    const onVehicleChange = vi.fn()

    render(
      <PackageTransportVoucherDetailsForm
        voucherForm={voucherForm}
        passengerError=""
        onUpdateField={onUpdateField}
        onVehicleChange={onVehicleChange}
        onProviderNameChange={vi.fn()}
        onProviderContactChange={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Flight number'), {
      target: { value: 'BA123' },
    })
    fireEvent.change(screen.getByLabelText('Adults'), {
      target: { value: '4' },
    })
    fireEvent.change(screen.getByLabelText('Vehicle type'), {
      target: { value: 'Hiace' },
    })

    expect(onUpdateField).toHaveBeenCalledWith('flightNumber', 'BA123')
    expect(onUpdateField).toHaveBeenCalledWith('adults', 4)
    expect(onVehicleChange).toHaveBeenCalledWith('Hiace')
  })

  it('shows passenger-capacity guidance supplied by the workspace', () => {
    render(
      <PackageTransportVoucherDetailsForm
        voucherForm={voucherForm}
        passengerError="Exceeds capacity of 1. Select a larger vehicle."
        onUpdateField={vi.fn()}
        onVehicleChange={vi.fn()}
        onProviderNameChange={vi.fn()}
        onProviderContactChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Exceeds capacity of 1. Select a larger vehicle.')).toBeTruthy()
  })
})
