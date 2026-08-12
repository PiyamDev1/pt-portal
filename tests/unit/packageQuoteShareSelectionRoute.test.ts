import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageQuotePayload } from '@/app/types/packages'

const payload: PackageQuotePayload = {
  title: 'Shared Customer Quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  adults: 2,
  childrenPaying: 1,
  childrenFree: 0,
  infants: 0,
  itineraryOrder: ['makkah'],
  departureDate: '',
  returnDate: '',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [{ id: 'hotel-a', title: 'Hotel A', summary: 'Hotel A', price: 1200 }],
    },
  ],
  flightOptions: [],
  linkedFlightGroups: [],
  visaOptions: [],
  transportOptions: [],
  limitedTimeOffers: [],
  cardProcessingFeePercent: 0,
  notes: '',
}

const mocks = vi.hoisted(() => {
  const quoteSingle = vi.fn()
  const quoteQuery = {
    eq: vi.fn(),
    neq: vi.fn(),
    single: quoteSingle,
  }
  quoteQuery.eq.mockReturnValue(quoteQuery)
  quoteQuery.neq.mockReturnValue(quoteQuery)

  const updateEq = vi.fn()
  const select = vi.fn(() => quoteQuery)
  const update = vi.fn(() => ({ eq: updateEq }))
  const from = vi.fn(() => ({ select, update }))
  const getServiceSupabaseClient = vi.fn(() => ({ from }))

  return {
    quoteSingle,
    updateEq,
    select,
    update,
    from,
    getServiceSupabaseClient,
  }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { POST } from '@/app/api/packages/share/[token]/selection/route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/packages/share/share-token/selection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function allObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(allObjectKeys)
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    key,
    ...allObjectKeys(child),
  ])
}

describe('POST /api/packages/share/[token]/selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.quoteSingle.mockResolvedValue({
      data: {
        id: 'quote-share',
        payload,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      error: null,
    })
    mocks.updateEq.mockResolvedValue({ error: null })
  })

  it('stores customer-entered contact details from a shared quote selection', async () => {
    const response = await POST(
      makeRequest({
        stayOptionIds: { makkah: 'hotel-a' },
        customerName: 'Customer One',
        customerPhone: '+447111111111',
        customerEmail: 'customer@example.com',
        note: 'Please call after 5pm',
        termsAccepted: true,
      }) as never,
      { params: Promise.resolve({ token: 'share-token' }) },
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.selected.combination.totalPrice).toBe(1200)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_name: 'Customer One',
        customer_phone: '+447111111111',
        customer_email: 'customer@example.com',
        selection_note: 'Please call after 5pm',
      }),
    )
    expect(mocks.updateEq).toHaveBeenCalledWith('id', 'quote-share')
  })

  it('saves linked package selections without finalising the quote', async () => {
    const response = await POST(
      makeRequest({
        stayOptionIds: { makkah: 'hotel-a' },
        customerName: 'Linked Customer',
        customerPhone: '+447222222222',
        customerEmail: 'linked@example.com',
        note: 'Save before switching family',
        saveOnly: true,
      }) as never,
      { params: Promise.resolve({ token: 'share-token' }) },
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.saveOnly).toBe(true)
    expect(body.selected.combination.totalPrice).toBe(1200)
    expect(mocks.update).toHaveBeenCalledWith(
      expect.not.objectContaining({
        status: 'customer_selected',
        finalised_source: 'customer',
      }),
    )
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_name: 'Linked Customer',
        selection_note: 'Save before switching family',
      }),
    )
  })

  it('rejects oversized public selection bodies before loading the quote', async () => {
    const response = await POST(
      makeRequest({
        stayOptionIds: { makkah: 'hotel-a' },
        note: 'x'.repeat(64 * 1024),
        termsAccepted: true,
      }) as never,
      { params: Promise.resolve({ token: 'share-token' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(413)
    expect(body.error).toBe('Request body is too large')
    expect(mocks.quoteSingle).not.toHaveBeenCalled()
  })

  it('rejects selection maps with more than 50 groups', async () => {
    const response = await POST(
      makeRequest({
        stayOptionIds: Object.fromEntries(
          Array.from({ length: 51 }, (_, index) => [`stay-${index}`, `hotel-${index}`]),
        ),
        termsAccepted: true,
      }) as never,
      { params: Promise.resolve({ token: 'share-token' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('A selection can contain at most 50 groups')
    expect(mocks.quoteSingle).not.toHaveBeenCalled()
  })

  it('returns a customer-safe selection while retaining the full internal record', async () => {
    const payloadWithInternalTransport: PackageQuotePayload = {
      ...payload,
      transportOptions: [
        {
          id: 'transport-a',
          title: 'Private transport',
          summary: 'Customer-visible transport summary',
          price: 500,
          searchPrice: 250,
          adjustedPrice: 500,
          transportMainSupplierId: 'supplier-secret-id',
          transportMainSupplierName: 'Secret Supplier Ltd',
          transportNetCost: 175,
          transportNetCurrency: 'SAR',
          transportRoutes: [
            {
              id: 'route-selection-a',
              kind: 'transfer',
              routeId: 'route-a',
              routeName: 'Jeddah to Makkah',
              supplierId: 'route-supplier-secret-id',
              supplierName: 'Route Supplier Secret',
              vehicleTypeId: 'vehicle-a',
              vehicleLabel: 'GMC Yukon',
              costPrice: 650,
              currency: 'SAR',
              baseCostPriceGbp: 130,
              costPriceGbp: 145,
              exchangeRate: 5,
              exchangeRateMode: 'sar_per_gbp',
              damageRecoveryMarginMode: 'percent',
              damageRecoveryMarginValue: 10,
              damageRecoveryMarginAmountGbp: 15,
            },
          ],
        },
      ],
    }
    mocks.quoteSingle.mockResolvedValueOnce({
      data: {
        id: 'quote-share',
        payload: payloadWithInternalTransport,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      error: null,
    })

    const response = await POST(
      makeRequest({
        stayOptionIds: { makkah: 'hotel-a' },
        transportOptionId: 'transport-a',
        customerName: 'Customer Secret Name',
        customerPhone: '+447333333333',
        customerEmail: 'customer-secret@example.com',
        note: 'Private customer request',
        termsAccepted: true,
      }) as never,
      { params: Promise.resolve({ token: 'share-token' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.selected.combination.totalPrice).toBe(1700)
    expect(body.selected.combination.currency).toBe('GBP')
    expect(body.selected.combination.transportOption).toEqual(
      expect.objectContaining({
        id: 'transport-a',
        price: 500,
        transportRoutes: [
          {
            id: 'route-selection-a',
            kind: 'transfer',
            routeId: 'route-a',
            routeName: 'Jeddah to Makkah',
            vehicleTypeId: 'vehicle-a',
            vehicleLabel: 'GMC Yukon',
          },
        ],
      }),
    )

    const forbiddenKeys = new Set([
      'customerName',
      'customerPhone',
      'customerEmail',
      'note',
      'searchPrice',
      'adjustedPrice',
      'transportMainSupplierId',
      'transportMainSupplierName',
      'transportNetCost',
      'transportNetCurrency',
      'supplierId',
      'supplierName',
      'costPrice',
      'baseCostPriceGbp',
      'costPriceGbp',
      'exchangeRate',
      'exchangeRateMode',
      'damageRecoveryMarginMode',
      'damageRecoveryMarginValue',
      'damageRecoveryMarginAmountGbp',
    ])
    expect(allObjectKeys(body.selected).filter((key) => forbiddenKeys.has(key))).toEqual([])
    expect(JSON.stringify(body)).not.toContain('Secret Supplier Ltd')
    expect(JSON.stringify(body)).not.toContain('Route Supplier Secret')
    expect(JSON.stringify(body)).not.toContain('Private customer request')
    expect(JSON.stringify(body)).not.toContain('customer-secret@example.com')

    const savedUpdate = mocks.update.mock.calls.at(-1)?.[0] as {
      selected_option: {
        selection: Record<string, unknown>
        combination: { transportOption: Record<string, unknown> }
      }
    }
    expect(savedUpdate.selected_option.selection).toEqual(
      expect.objectContaining({
        customerName: 'Customer Secret Name',
        customerPhone: '+447333333333',
        customerEmail: 'customer-secret@example.com',
        note: 'Private customer request',
      }),
    )
    expect(savedUpdate.selected_option.combination.transportOption).toEqual(
      expect.objectContaining({
        transportMainSupplierId: 'supplier-secret-id',
        transportMainSupplierName: 'Secret Supplier Ltd',
        transportNetCost: 175,
      }),
    )
  })
})
