import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  UmrahTransportPricingRatesPanel,
  type UmrahTransportPricingRatesModel,
} from '@/app/dashboard/settings/components/pricing/UmrahTransportPricingRatesPanel'

function buildModel(): UmrahTransportPricingRatesModel {
  return {
    plans: [
      {
        id: 'plan-1',
        plan_name: 'Airport plan',
        preferred_supplier_id: null,
        is_active: true,
        sort_order: 10,
        notes: null,
      },
    ],
    segmentsByPlanId: new Map([
      [
        'plan-1',
        [
          {
            id: 'segment-1',
            plan_id: 'plan-1',
            route_id: 'route-1',
            segment_label: 'Airport transfer',
            sort_order: 10,
          },
        ],
      ],
    ]),
    routes: [
      {
        id: 'route-1',
        route_name: 'Jeddah to Makkah',
        preferred_supplier_id: null,
        is_active: true,
        sort_order: 10,
        notes: null,
      },
      {
        id: 'route-makkah',
        route_name: 'Makkah Ziyarat',
        preferred_supplier_id: null,
        is_active: true,
        sort_order: 20,
        notes: null,
      },
      {
        id: 'route-madinah',
        route_name: 'Madinah Ziyarat',
        preferred_supplier_id: null,
        is_active: true,
        sort_order: 30,
        notes: null,
      },
    ],
    routeUsageCountById: new Map([['route-1', 2]]),
    suppliers: [
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
      {
        id: 'supplier-2',
        name: 'Supplier Two',
        contact_name: null,
        contact_phone: null,
        default_currency: 'SAR',
        is_active: true,
        sort_order: 20,
        notes: null,
      },
    ],
    supplierDrafts: {
      'supplier-1': { name: 'Supplier One', default_currency: 'SAR', notes: '' },
      'supplier-2': { name: 'Supplier Two', default_currency: 'SAR', notes: '' },
    },
    vehicles: [
      {
        id: 'vehicle-1',
        label: 'Car',
        passenger_capacity: '1-3',
        is_active: true,
        sort_order: 10,
        notes: null,
      },
    ],
    vehicleDrafts: {
      'vehicle-1': { label: 'Car', passenger_capacity: '1-3', sort_order: 10 },
    },
    planDrafts: {
      'plan-1': { plan_name: 'Airport plan', preferred_supplier_id: '', notes: '' },
    },
    rateDrafts: {
      'route-1:supplier-1:vehicle-1': '100',
      'route-1:supplier-2:vehicle-1': '90',
      'route-makkah:supplier-1:vehicle-1': '50',
      'route-makkah:supplier-2:vehicle-1': '40',
      'route-madinah:supplier-1:vehicle-1': '60',
      'route-madinah:supplier-2:vehicle-1': '70',
    },
    guideDrafts: {
      'supplier-1:umrah': '20',
      'supplier-1:madinah': '30',
      'supplier-1:makkah': '40',
    },
    supplierVehicleLabelDrafts: {
      'supplier-1:vehicle-1': 'Sedan',
    },
    onUpdatePlan: vi.fn(),
    onUpdateVehicle: vi.fn(),
    onUpdateRate: vi.fn(),
    onUpdateGuide: vi.fn(),
    onUpdateSupplierVehicleLabel: vi.fn(),
  }
}

describe('UmrahTransportPricingRatesPanel', () => {
  it('renders linked comparisons and forwards rate-grid edits through one model', () => {
    const model = buildModel()
    render(<UmrahTransportPricingRatesPanel model={model} />)

    expect(screen.getByText('linked x2')).toBeTruthy()
    expect(screen.getByText('SAR 90.00')).toBeTruthy()

    fireEvent.change(screen.getByRole('textbox', { name: 'Airport plan plan name' }), {
      target: { value: 'Updated plan' },
    })
    fireEvent.change(screen.getByRole('combobox', { name: 'Fixed supplier' }), {
      target: { value: 'supplier-2' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Supplier One Car transport label' }), {
      target: { value: 'Executive car' },
    })
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Supplier One Car Airport transfer cost' }),
      { target: { value: '105' } },
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Supplier One Car Umrah guide cost' }), {
      target: { value: '25' },
    })

    expect(model.onUpdatePlan).toHaveBeenCalledWith('plan-1', {
      plan_name: 'Updated plan',
    })
    expect(model.onUpdatePlan).toHaveBeenCalledWith('plan-1', {
      preferred_supplier_id: 'supplier-2',
    })
    expect(model.onUpdateSupplierVehicleLabel).toHaveBeenCalledWith(
      'supplier-1',
      'vehicle-1',
      'Executive car',
    )
    expect(model.onUpdateRate).toHaveBeenCalledWith('route-1', 'supplier-1', 'vehicle-1', '105')
    expect(model.onUpdateGuide).toHaveBeenCalledWith('supplier-1', 'umrah', '25')
  })

  it('owns transient route-table collapse state', () => {
    render(<UmrahTransportPricingRatesPanel model={buildModel()} />)

    fireEvent.click(screen.getByTitle('Collapse route table'))
    expect(screen.queryByRole('combobox', { name: 'Fixed supplier' })).toBeNull()

    fireEvent.click(screen.getByTitle('Expand route table'))
    expect(screen.getByRole('combobox', { name: 'Fixed supplier' })).toBeTruthy()
  })
})
