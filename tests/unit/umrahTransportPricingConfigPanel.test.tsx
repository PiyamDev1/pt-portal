import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  UmrahTransportPricingConfigPanel,
  type UmrahTransportPricingConfigModel,
} from '@/app/dashboard/settings/components/pricing/UmrahTransportPricingConfigPanel'

function buildModel(): UmrahTransportPricingConfigModel {
  return {
    saving: false,
    exchangeRate: {
      sarToGbp: '4.75',
      onSarToGbpChange: vi.fn(),
      damageRecoveryMode: 'fixed',
      onDamageRecoveryModeChange: vi.fn(),
      damageRecoveryValue: '10',
      onDamageRecoveryValueChange: vi.fn(),
    },
    suppliers: {
      items: [
        {
          id: 'supplier-1',
          name: 'Supplier One',
          contact_name: null,
          contact_phone: null,
          default_currency: 'SAR',
          is_active: true,
          sort_order: 10,
          notes: null,
        },
      ],
      drafts: {
        'supplier-1': { name: 'Supplier One', default_currency: 'SAR', notes: '' },
      },
      onUpdate: vi.fn(),
      onRemove: vi.fn().mockResolvedValue(undefined),
      onAdd: vi.fn().mockResolvedValue(true),
    },
    vehicles: {
      items: [
        {
          id: 'vehicle-1',
          label: 'Car',
          passenger_capacity: '1-3',
          is_active: true,
          sort_order: 10,
          notes: null,
        },
        {
          id: 'vehicle-2',
          label: 'Minibus',
          passenger_capacity: '4-12',
          is_active: true,
          sort_order: 20,
          notes: null,
        },
      ],
      drafts: {
        'vehicle-1': { label: 'Car', passenger_capacity: '1-3', sort_order: 10 },
        'vehicle-2': { label: 'Minibus', passenger_capacity: '4-12', sort_order: 20 },
      },
      onUpdate: vi.fn(),
      onReorder: vi.fn(),
      onAdd: vi.fn().mockResolvedValue(true),
    },
    summary: {
      routeSections: 3,
      editedRouteCells: 4,
      linkedRoutePrices: 2,
    },
  }
}

describe('UmrahTransportPricingConfigPanel', () => {
  it('forwards persisted configuration edits through the typed model', () => {
    const model = buildModel()
    render(<UmrahTransportPricingConfigPanel model={model} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'SAR per 1 GBP' }), {
      target: { value: '4.80' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Mode' }), {
      target: { value: 'percent' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Supplier One supplier name' }), {
      target: { value: 'Updated supplier' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Car passenger capacity' }), {
      target: { value: '1-4' },
    })

    expect(model.exchangeRate.onSarToGbpChange).toHaveBeenCalledWith('4.80')
    expect(model.exchangeRate.onDamageRecoveryModeChange).toHaveBeenCalledWith('percent')
    expect(model.suppliers.onUpdate).toHaveBeenCalledWith('supplier-1', {
      name: 'Updated supplier',
    })
    expect(model.vehicles.onUpdate).toHaveBeenCalledWith('vehicle-1', {
      passenger_capacity: '1-4',
    })
  })

  it('owns transient add and drag state while delegating mutations', async () => {
    const model = buildModel()
    render(<UmrahTransportPricingConfigPanel model={model} />)

    const supplierInput = screen.getByPlaceholderText('New supplier') as HTMLInputElement
    fireEvent.change(supplierInput, { target: { value: 'Supplier Two' } })
    fireEvent.click(screen.getByTitle('Add supplier'))
    await waitFor(() => expect(model.suppliers.onAdd).toHaveBeenCalledWith('Supplier Two'))
    await waitFor(() => expect(supplierInput.value).toBe(''))

    const vehicleInput = screen.getByPlaceholderText('New vehicle') as HTMLInputElement
    const capacityInput = screen.getByPlaceholderText('PAX label') as HTMLInputElement
    fireEvent.change(vehicleInput, { target: { value: 'Coach' } })
    fireEvent.change(capacityInput, { target: { value: '13-49' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add Vehicle Row' }))
    await waitFor(() => expect(model.vehicles.onAdd).toHaveBeenCalledWith('Coach', '13-49'))
    await waitFor(() => expect(vehicleInput.value).toBe(''))

    fireEvent.dragStart(screen.getByTestId('vehicle-row-vehicle-1'))
    fireEvent.drop(screen.getByTestId('vehicle-row-vehicle-2'))
    expect(model.vehicles.onReorder).toHaveBeenCalledWith('vehicle-1', 'vehicle-2')
  })
})
