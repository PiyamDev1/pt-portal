import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  PackageQuoteDetails,
  type PackageQuoteDetailsModel,
} from '@/app/dashboard/packages/PackageQuoteDetails'
import { formatPackageTypeName } from '@/app/dashboard/packages/packageQuoteEditorModel'
import type { PackageQuotePayload } from '@/app/types/packages'

function buildPayload(overrides: Partial<PackageQuotePayload> = {}): PackageQuotePayload {
  return {
    title: 'ABC123 - Umrah Quotation 06 Oct 2026',
    packageType: 'umrah',
    currency: 'GBP',
    customerName: 'Lead Family',
    customerPhone: '+447000000001',
    customerEmail: 'lead@example.com',
    adults: 2,
    childrenPaying: 1,
    childrenFree: 0,
    infants: 0,
    itineraryOrder: ['makkah', 'madinah'],
    departureDate: '2026-12-01',
    returnDate: '2026-12-10',
    stayGroups: [
      { id: 'makkah', label: 'Makkah', options: [] },
      { id: 'madinah', label: 'Madinah', options: [] },
    ],
    flightOptions: [],
    linkedFlightGroups: [],
    visaOptions: [],
    transportOptions: [],
    limitedTimeOffers: [],
    cardProcessingFeePercent: 2.5,
    depositRequired: false,
    depositAmount: 0,
    notes: '',
    ...overrides,
  }
}

function buildModel(overrides: Partial<PackageQuoteDetailsModel> = {}): PackageQuoteDetailsModel {
  return {
    payload: buildPayload(),
    systematicQuoteTitle: 'ABC123 - Umrah Quotation 06 Oct 2026',
    expiresAtInput: '2026-10-09T12:00',
    minimumExpiryInput: '2026-10-06T12:00',
    updatePayload: vi.fn(),
    applyPackageType: vi.fn(),
    setExpiresAtInput: vi.fn(),
    ...overrides,
  }
}

describe('PackageQuoteDetails', () => {
  it('owns fee disclosure and delegates quote draft changes to the parent', () => {
    const model = buildModel()
    render(<PackageQuoteDetails model={model} />)

    expect(formatPackageTypeName('ziyarat')).toBe('Ziyarat')
    expect(screen.getByLabelText(/System quote name/).getAttribute('readonly')).not.toBeNull()
    expect(screen.getByLabelText(/Quote expires/).getAttribute('min')).toBe(
      model.minimumExpiryInput,
    )

    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'holiday' } })
    fireEvent.change(screen.getByLabelText('Customer name'), {
      target: { value: 'Updated Family' },
    })
    fireEvent.change(screen.getByLabelText('Adults 12+'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText(/Quote expires/), {
      target: { value: '2026-10-10T13:00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'No deposit required' }))
    fireEvent.click(screen.getByRole('button', { name: 'Madinah first' }))

    expect(model.applyPackageType).toHaveBeenCalledWith('holiday')
    expect(model.updatePayload).toHaveBeenCalledWith({ customerName: 'Updated Family' })
    expect(model.updatePayload).toHaveBeenCalledWith({ adults: 4 })
    expect(model.setExpiresAtInput).toHaveBeenCalledWith('2026-10-10T13:00')
    expect(model.updatePayload).toHaveBeenCalledWith({ depositRequired: true })
    expect(model.updatePayload).toHaveBeenCalledWith({
      itineraryOrder: ['madinah', 'makkah'],
    })

    expect(screen.queryByLabelText(/Processing fee percentage/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Credit Card processing fee/i }))
    fireEvent.change(screen.getByLabelText(/Processing fee percentage/), {
      target: { value: '3.25' },
    })
    expect(model.updatePayload).toHaveBeenCalledWith({ cardProcessingFeePercent: 3.25 })
  })

  it('shows the fixed first location for holiday quotations', () => {
    render(
      <PackageQuoteDetails
        model={buildModel({
          payload: buildPayload({
            packageType: 'holiday',
            itineraryOrder: ['location-1'],
            stayGroups: [{ id: 'location-1', label: 'Istanbul', options: [] }],
          }),
        })}
      />,
    )

    expect(screen.getByText('Holiday starting point')).toBeTruthy()
    expect(screen.getByText('Istanbul')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Madinah first' })).toBeNull()
  })
})
