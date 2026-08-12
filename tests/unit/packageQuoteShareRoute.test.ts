import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PackageQuotePayload } from '@/app/types/packages'
import { resolvePackageSelection } from '@/lib/packageQuote'

const currentPayload: PackageQuotePayload = {
  title: 'Customer-safe Umrah quote',
  packageType: 'umrah',
  currency: 'GBP',
  customerName: 'Current Customer',
  customerPhone: '+447000000001',
  customerEmail: 'current@example.com',
  adults: 2,
  childrenPaying: 0,
  childrenFree: 0,
  infants: 0,
  itineraryOrder: ['makkah'],
  departureDate: '2026-09-01',
  returnDate: '2026-09-10',
  stayGroups: [
    {
      id: 'makkah',
      label: 'Makkah',
      options: [
        {
          id: 'hotel-a',
          title: 'Hotel A',
          summary: 'Customer-visible hotel summary',
          price: 1200,
          searchPrice: 800,
          adjustedPrice: 1200,
        },
      ],
    },
  ],
  flightOptions: [],
  linkedFlightGroups: [],
  visaOptions: [],
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
  linkedPackageGroup: {
    groupId: 'group-1',
    groupReference: 'TPG-001',
    title: 'Customer-visible linked group',
    visibilityMode: 'shared_group_view',
    currentFamilyLabel: 'Current family',
    sharedFlightSelection: true,
    linkedFamilies: [],
    sharedServices: [],
  },
  limitedTimeOffers: [],
  cardProcessingFeePercent: 3,
  notes: 'Agent-only free-form quote note',
}

const linkedPayload: PackageQuotePayload = {
  ...currentPayload,
  title: 'Linked customer-visible quote',
  customerName: 'Other Family Sensitive Name',
  customerPhone: '+447000000099',
  customerEmail: 'other-family@example.com',
  linkedPackageGroup: null,
  notes: 'Other family agent-only note',
}

const mocks = vi.hoisted(() => {
  const state = { quoteCall: 0 }
  const currentSingle = vi.fn()
  const groupSingle = vi.fn()
  const membersResult = vi.fn()
  const linkedQuotesResult = vi.fn()

  const from = vi.fn((table: string) => {
    if (table === 'travel_package_groups') {
      const query = { select: vi.fn(), eq: vi.fn(), single: groupSingle }
      query.select.mockReturnValue(query)
      query.eq.mockReturnValue(query)
      return query
    }

    if (table === 'travel_package_group_members') {
      const secondOrder = vi.fn(() => membersResult())
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(() => ({ order: secondOrder })),
      }
      query.select.mockReturnValue(query)
      query.eq.mockReturnValue(query)
      return query
    }

    if (table === 'travel_package_quotes') {
      const quoteCall = state.quoteCall++
      if (quoteCall === 0) {
        const query = {
          select: vi.fn(),
          eq: vi.fn(),
          neq: vi.fn(),
          single: currentSingle,
        }
        query.select.mockReturnValue(query)
        query.eq.mockReturnValue(query)
        query.neq.mockReturnValue(query)
        return query
      }

      const query = { select: vi.fn(), in: vi.fn(), neq: linkedQuotesResult }
      query.select.mockReturnValue(query)
      query.in.mockReturnValue(query)
      return query
    }

    throw new Error(`Unexpected table ${table}`)
  })

  const getServiceSupabaseClient = vi.fn(() => ({ from }))

  return {
    currentSingle,
    groupSingle,
    membersResult,
    linkedQuotesResult,
    from,
    getServiceSupabaseClient,
    state,
  }
})

vi.mock('@/lib/api/serviceSupabase', () => ({
  getServiceSupabaseClient: mocks.getServiceSupabaseClient,
}))

import { GET } from '@/app/api/packages/share/[token]/route'

function futureExpiry() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString()
}

function allObjectKeys(value: unknown): string[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(allObjectKeys)
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => [
    key,
    ...allObjectKeys(child),
  ])
}

describe('GET /api/packages/share/[token]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.quoteCall = 0
    const expiresAt = futureExpiry()
    const selected = resolvePackageSelection(currentPayload, {
      stayOptionIds: { makkah: 'hotel-a' },
      transportOptionId: 'transport-a',
      customerName: 'Saved Current Customer',
      customerPhone: '+447000000002',
      customerEmail: 'saved@example.com',
      note: 'Saved internal customer note',
    })
    const selectedWithUnknownInternals = {
      ...selected,
      internalSelectionMemo: 'unknown root selection secret',
      selection: {
        ...selected.selection,
        agentOnlySelectionField: 'unknown selection secret',
      },
      combination: {
        ...selected.combination,
        internalCostLedger: 'unknown combination secret',
        transportOption: selected.combination.transportOption
          ? {
              ...selected.combination.transportOption,
              futureSupplierContract: 'unknown option secret',
            }
          : null,
      },
    } as typeof selected

    mocks.currentSingle.mockResolvedValue({
      data: {
        id: 'quote-current',
        title: currentPayload.title,
        customer_name: 'Current Customer',
        customer_phone: '+447000000001',
        customer_email: 'current@example.com',
        payload: currentPayload,
        expires_at: expiresAt,
        selected_option: selectedWithUnknownInternals,
        share_token: 'must-not-be-returned',
        created_by: 'agent-secret-id',
        selection_note: 'must-not-be-returned',
      },
      error: null,
    })
    mocks.groupSingle.mockResolvedValue({
      data: {
        id: 'group-1',
        group_reference: 'TPG-001',
        title: 'Customer-visible linked group',
        customer_visibility_mode: 'shared_group_view',
        metadata: { sharedFlightSelection: true, internalGroupNote: 'never public' },
      },
      error: null,
    })
    mocks.membersResult.mockResolvedValue({
      data: [
        {
          quote_id: 'quote-current',
          family_label: 'Current family',
          customer_visible: true,
          metadata: { customerName: 'Current metadata name' },
        },
        {
          quote_id: 'quote-linked',
          family_label: 'Visible linked family',
          customer_visible: true,
          metadata: { customerName: 'Other metadata sensitive name' },
        },
        {
          quote_id: 'quote-hidden',
          family_label: 'Hidden family',
          customer_visible: false,
          metadata: { customerName: 'Hidden metadata name' },
        },
      ],
      error: null,
    })
    mocks.linkedQuotesResult.mockResolvedValue({
      data: [
        {
          id: 'quote-linked',
          title: linkedPayload.title,
          payload: linkedPayload,
          share_token: 'linked-public-token',
          share_enabled: true,
          expires_at: expiresAt,
          selected_option: null,
        },
      ],
      error: null,
    })
  })

  it('returns UI-required retail fields while excluding staff and transport internals', async () => {
    const response = await GET(
      new Request('http://localhost/api/packages/share/current-public-token') as never,
      { params: Promise.resolve({ token: 'current-public-token' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(Object.keys(body.quote).sort()).toEqual([
      'customer_email',
      'customer_name',
      'customer_phone',
      'expires_at',
      'payload',
      'selected_option',
    ])
    expect(body.quote).toEqual(
      expect.objectContaining({
        expires_at: expect.any(String),
        customer_name: 'Current Customer',
        customer_phone: '+447000000001',
        customer_email: 'current@example.com',
        payload: expect.objectContaining({
          title: 'Customer-safe Umrah quote',
          currency: 'GBP',
          transportOptions: [
            expect.objectContaining({
              id: 'transport-a',
              price: 500,
              transportRoutes: [
                expect.objectContaining({
                  routeName: 'Jeddah to Makkah',
                  vehicleLabel: 'GMC Yukon',
                }),
              ],
            }),
          ],
        }),
        selected_option: expect.objectContaining({
          combination: expect.objectContaining({ totalPrice: 1700, currency: 'GBP' }),
        }),
      }),
    )

    const forbiddenKeys = new Set([
      'share_token',
      'created_by',
      'selection_note',
      'customerName',
      'customerPhone',
      'customerEmail',
      'note',
      'notes',
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
    const publicResponseKeys = allObjectKeys(body)
    expect(publicResponseKeys.filter((key) => forbiddenKeys.has(key))).toEqual([])

    const publicTransport = body.quote.payload.transportOptions[0]
    expect(publicTransport).not.toHaveProperty('transportMainSupplierId')
    expect(publicTransport).not.toHaveProperty('transportMainSupplierName')
    expect(publicTransport).not.toHaveProperty('transportNetCost')
    expect(publicTransport).not.toHaveProperty('transportNetCurrency')
    expect(publicTransport.transportRoutes[0]).toEqual({
      id: 'route-selection-a',
      kind: 'transfer',
      routeId: 'route-a',
      routeName: 'Jeddah to Makkah',
      vehicleTypeId: 'vehicle-a',
      vehicleLabel: 'GMC Yukon',
    })

    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('Secret Supplier Ltd')
    expect(serialized).not.toContain('Route Supplier Secret')
    expect(serialized).not.toContain('Agent-only free-form quote note')
    expect(serialized).not.toContain('Saved internal customer note')
    expect(serialized).not.toContain('must-not-be-returned')
    expect(serialized).not.toContain('never public')
    expect(serialized).not.toContain('unknown root selection secret')
    expect(serialized).not.toContain('unknown selection secret')
    expect(serialized).not.toContain('unknown combination secret')
    expect(serialized).not.toContain('unknown option secret')
    expect(serialized).not.toContain('Other Family Sensitive Name')
    expect(serialized).not.toContain('other-family@example.com')
    expect(serialized).not.toContain('Hidden family')

    expect(body.linkedGroup).toEqual(
      expect.objectContaining({
        groupReference: 'TPG-001',
        title: 'Customer-visible linked group',
        sharedFlightSelection: true,
      }),
    )
    expect(body.linkedGroup).not.toHaveProperty('groupId')
    expect(body.linkedGroup).not.toHaveProperty('visibilityMode')
    expect(body.linkedGroup.families).toHaveLength(2)
    expect(body.linkedGroup.families[1]).toEqual(
      expect.objectContaining({
        familyLabel: 'Visible linked family',
        quoteTitle: 'Linked customer-visible quote',
        sharePath: '/packages/linked-public-token',
        payload: expect.objectContaining({ title: 'Linked customer-visible quote' }),
        baseSelection: expect.objectContaining({ stayOptionIds: { makkah: 'hotel-a' } }),
        pricing: expect.objectContaining({ totalPrice: 1700, currency: 'GBP' }),
      }),
    )
    expect(body.linkedGroup.families[1]).not.toHaveProperty('customerName')
    expect(body.linkedGroup.families[1]).not.toHaveProperty('quoteId')
  })

  it('does not expose linked-group data when customer visibility is private', async () => {
    mocks.groupSingle.mockResolvedValueOnce({
      data: {
        id: 'group-1',
        group_reference: 'TPG-001',
        title: 'Private linked group',
        customer_visibility_mode: 'private',
        metadata: { sharedFlightSelection: true },
      },
      error: null,
    })

    const response = await GET(
      new Request('http://localhost/api/packages/share/current-public-token') as never,
      { params: Promise.resolve({ token: 'current-public-token' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.linkedGroup).toBeNull()
    expect(mocks.state.quoteCall).toBe(1)
    expect(mocks.membersResult).not.toHaveBeenCalled()
  })

  it('returns only a generic notice for linked-notice groups', async () => {
    mocks.groupSingle.mockResolvedValueOnce({
      data: {
        id: 'group-1',
        group_reference: 'SECRET-GROUP-REFERENCE',
        title: 'Sensitive linked group title',
        customer_visibility_mode: 'linked_notice_only',
        metadata: { sharedFlightSelection: true },
      },
      error: null,
    })

    const response = await GET(
      new Request('http://localhost/api/packages/share/current-public-token') as never,
      { params: Promise.resolve({ token: 'current-public-token' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.linkedGroup).toEqual({
      notice: 'This package shares travel arrangements with another family or group.',
    })
    expect(JSON.stringify(body)).not.toContain('SECRET-GROUP-REFERENCE')
    expect(JSON.stringify(body)).not.toContain('Sensitive linked group title')
    expect(JSON.stringify(body)).not.toContain('Visible linked family')
    expect(mocks.membersResult).not.toHaveBeenCalled()
    expect(mocks.state.quoteCall).toBe(1)
  })
})
