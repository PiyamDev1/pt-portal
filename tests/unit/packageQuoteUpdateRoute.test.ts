import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageQuotePayload, TravelPackageQuote } from '@/app/types/packages'
import {
  buildPackageSnapshot,
  normalizePackageQuotePayload,
  resolvePackageSelection,
} from '@/lib/packageQuote'

const payload: PackageQuotePayload = {
  title: 'Editable Quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: 'A Khan',
  customerPhone: '+447000000000',
  customerEmail: 'a@example.com',
  adults: 2,
  childrenPaying: 0,
  childrenFree: 0,
  infants: 0,
  itineraryOrder: ['makkah'],
  departureDate: '',
  returnDate: '',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [{ id: 'hotel-a', title: 'Hotel A', summary: 'Hotel A', price: 1000 }],
    },
  ],
  flightOptions: [],
  visaOptions: [],
  transportOptions: [],
  limitedTimeOffers: [],
  cardProcessingFeePercent: 0,
  notes: '',
}

const mocks = vi.hoisted(() => {
  const getUser = vi.fn()
  const updateSingle = vi.fn()
  const updateSelect = vi.fn(() => ({ single: updateSingle }))
  const updateEq = vi.fn(() => ({ select: updateSelect }))
  const update = vi.fn(() => ({ eq: updateEq }))
  const packageMaybeSingle = vi.fn()
  const packageSelectEq = vi.fn(() => ({ maybeSingle: packageMaybeSingle }))
  const packageSelect = vi.fn(() => ({ eq: packageSelectEq }))
  const packageUpdateEq = vi.fn()
  const packageUpdate = vi.fn(() => ({ eq: packageUpdateEq }))
  const auditInsert = vi.fn()
  const from = vi.fn((table: string) => {
    if (table === 'travel_packages') {
      return { select: packageSelect, update: packageUpdate }
    }
    if (table === 'travel_package_audit_events') return { insert: auditInsert }
    return { update }
  })
  const getRouteSupabaseClient = vi.fn(async () => ({
    auth: { getUser },
    from,
  }))

  return {
    getUser,
    updateSingle,
    updateSelect,
    updateEq,
    update,
    packageMaybeSingle,
    packageSelectEq,
    packageSelect,
    packageUpdateEq,
    packageUpdate,
    auditInsert,
    from,
    getRouteSupabaseClient,
  }
})

vi.mock('@/lib/api/serverSupabase', () => ({
  getRouteSupabaseClient: mocks.getRouteSupabaseClient,
}))

import { PATCH } from '@/app/api/packages/[id]/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/packages/quote-1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/packages/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'agent-1' } } })
    mocks.packageUpdateEq.mockResolvedValue({ error: null })
    mocks.auditInsert.mockResolvedValue({ error: null })
    mocks.updateSingle.mockResolvedValue({
      data: {
        id: 'quote-1',
        title: payload.title,
        package_type: 'umrah',
        status: 'draft',
        currency: 'GBP',
        customer_name: payload.customerName,
        customer_phone: payload.customerPhone,
        customer_email: payload.customerEmail,
        payload,
        share_token: 'token',
        share_enabled: false,
        shared_at: null,
        expires_at: '2999-01-01T00:00:00.000Z',
        selected_option: null,
        selected_at: null,
        selection_note: null,
        converted_package_id: null,
        converted_at: null,
        created_by: 'agent-1',
        created_at: '2026-07-12T00:00:00.000Z',
        updated_at: '2026-07-12T00:00:00.000Z',
      },
      error: null,
    })
  })

  it('clears an existing customer selection when quote payload is edited', async () => {
    const response = await PATCH(makeRequest({ payload, shareEnabled: false }) as never, {
      params: Promise.resolve({ id: 'quote-1' }),
    })

    expect(response.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ title: 'Editable Quote' }),
        selected_option: null,
        selected_at: null,
        selection_note: null,
      }),
    )
  })

  it('refreshes the converted package snapshot after transport details are corrected', async () => {
    const originalPayload = normalizePackageQuotePayload({
      ...payload,
      transportOptions: [
        {
          id: 'transport-1',
          title: 'Private transport',
          summary: '* Jeddah Airport to Makkah Hotel (Car)',
          price: 300,
          pricingMode: 'total',
          isDefault: true,
          transportRoutes: [
            {
              id: 'route-1',
              kind: 'transfer',
              routeId: 'jeddah-makkah',
              routeName: 'Jeddah Airport to Makkah Hotel',
              supplierId: 'supplier-1',
              supplierName: 'Supplier 1',
              vehicleTypeId: 'car',
              vehicleLabel: 'Car',
              costPrice: 100,
              currency: 'GBP',
              costPriceGbp: 100,
            },
          ],
        },
      ],
    })
    const originalSelection = resolvePackageSelection(originalPayload, {
      stayOptionIds: { makkah: 'hotel-a' },
      transportOptionId: 'transport-1',
    })
    const originalQuote = {
      id: 'quote-1',
      title: originalPayload.title,
      package_type: 'umrah',
      status: 'converted',
      currency: 'GBP',
      customer_name: originalPayload.customerName,
      customer_phone: originalPayload.customerPhone,
      customer_email: originalPayload.customerEmail,
      payload: originalPayload,
      share_token: 'token',
      share_enabled: false,
      shared_at: null,
      expires_at: '2999-01-01T00:00:00.000Z',
      selected_option: originalSelection,
      selected_at: '2026-07-12T10:00:00.000Z',
      selection_note: null,
      converted_package_id: 'package-1',
      converted_at: '2026-07-12T10:05:00.000Z',
      created_by: 'agent-1',
      created_at: '2026-07-12T00:00:00.000Z',
      updated_at: '2026-07-12T00:00:00.000Z',
    } satisfies TravelPackageQuote
    const correctedPayload = normalizePackageQuotePayload({
      ...originalPayload,
      transportOptions: [
        {
          ...originalPayload.transportOptions[0],
          summary: '* Madinah Airport to Madinah Hotel (H1)',
          price: 420,
          transportRoutes: [
            {
              ...originalPayload.transportOptions[0].transportRoutes?.[0],
              routeId: 'madinah-airport-hotel',
              routeName: 'Madinah Airport to Madinah Hotel',
              vehicleTypeId: 'h1',
              vehicleLabel: 'H1',
            },
          ],
        },
      ],
    })

    mocks.packageMaybeSingle.mockResolvedValue({
      data: {
        id: 'package-1',
        selected_quote_snapshot: buildPackageSnapshot(originalQuote),
      },
      error: null,
    })
    mocks.updateSingle.mockResolvedValue({
      data: {
        ...originalQuote,
        payload: correctedPayload,
        selected_option: null,
        selected_at: null,
        converted_package_id: 'package-1',
      },
      error: null,
    })

    const response = await PATCH(
      makeRequest({ payload: correctedPayload, shareEnabled: false }) as never,
      { params: Promise.resolve({ id: 'quote-1' }) },
    )
    const responseBody = (await response.json()) as { packageSynced?: boolean }

    expect(response.status).toBe(200)
    expect(responseBody.packageSynced).toBe(true)
    expect(mocks.packageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_quote_snapshot: expect.objectContaining({
          selection: expect.objectContaining({
            combination: expect.objectContaining({
              transportOption: expect.objectContaining({
                price: 420,
                transportRoutes: [
                  expect.objectContaining({
                    routeName: 'Madinah Airport to Madinah Hotel',
                    vehicleLabel: 'H1',
                  }),
                ],
              }),
            }),
          }),
        }),
      }),
    )
    expect(mocks.packageUpdateEq).toHaveBeenCalledWith('id', 'package-1')
    expect(mocks.auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        package_id: 'package-1',
        quote_id: 'quote-1',
        event_type: 'package_quote_snapshot_refreshed',
      }),
    )
  })
})
