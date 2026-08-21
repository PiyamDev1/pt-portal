import { describe, expect, it } from 'vitest'
import type { PackageQuotePayload } from '@/app/types/packages'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'
import {
  buildLinkedPackageGroupSnapshot,
  copySharedPackageFlights,
  resolvePackageGroupCustomerShare,
} from '@/lib/packageGroups'

describe('package group helpers', () => {
  it('resolves one canonical live group link and prefers the lead quote', () => {
    const result = resolvePackageGroupCustomerShare(
      {
        lead_quote_id: 'quote-lead',
        customer_visibility_mode: 'shared_group_view',
        status: 'active',
      },
      [
        { quote_id: 'quote-other', is_lead_family: false, sort_order: 10 },
        { quote_id: 'quote-lead', is_lead_family: true, sort_order: 20 },
      ],
      [
        {
          id: 'quote-other',
          share_token: 'other-token',
          share_enabled: true,
          expires_at: '2099-01-01T00:00:00.000Z',
          status: 'shared',
        },
        {
          id: 'quote-lead',
          share_token: 'lead-token',
          share_enabled: true,
          expires_at: '2099-01-01T00:00:00.000Z',
          status: 'shared',
        },
      ],
    )

    expect(result).toEqual({
      quoteId: 'quote-lead',
      sharePath: '/packages/lead-token',
      expiresAt: '2099-01-01T00:00:00.000Z',
    })
  })

  it('falls back to another live family quote and disables private group links', () => {
    const group = {
      lead_quote_id: 'quote-expired',
      customer_visibility_mode: 'shared_group_view' as const,
      status: 'active' as const,
    }
    const members = [
      { quote_id: 'quote-expired', is_lead_family: true, sort_order: 10 },
      { quote_id: 'quote-live', is_lead_family: false, sort_order: 20 },
    ]
    const quotes = [
      {
        id: 'quote-expired',
        share_token: 'expired-token',
        share_enabled: true,
        expires_at: '2020-01-01T00:00:00.000Z',
        status: 'shared' as const,
      },
      {
        id: 'quote-live',
        share_token: 'live-token',
        share_enabled: true,
        expires_at: '2099-01-01T00:00:00.000Z',
        status: 'shared' as const,
      },
    ]

    expect(resolvePackageGroupCustomerShare(group, members, quotes)?.sharePath).toBe(
      '/packages/live-token',
    )
    expect(
      resolvePackageGroupCustomerShare(
        { ...group, customer_visibility_mode: 'private' },
        members,
        quotes,
      ),
    ).toBeNull()
  })

  it('copies shared flight structure while preserving matching family seat prices', () => {
    const source = {
      flightOptions: [
        {
          id: 'main-saudi',
          title: 'Saudi Airlines',
          summary: 'London to Jeddah',
          price: 500,
          searchPrice: 500,
          adjustedPrice: 500,
          pricingMode: 'per_person',
          isDefault: true,
          adultPrice: 500,
          childPrice: 420,
          infantPrice: 120,
        },
      ],
      linkedFlightGroups: [
        {
          id: 'return-leg',
          baseFlightOptionId: 'main-saudi',
          routeLabel: 'Madinah to London',
          defaultOptionId: 'wizz',
          options: [
            {
              id: 'wizz',
              airlineName: 'Wizz Air',
              summary: 'Direct return',
              adultPrice: 200,
              childPrice: 180,
              infantPrice: 50,
              adultDelta: 0,
              childDelta: 0,
              infantDelta: 0,
              isDefault: true,
            },
          ],
        },
      ],
    } as unknown as PackageQuotePayload
    const target = {
      ...source,
      title: 'Target family',
      flightOptions: [
        {
          ...source.flightOptions[0],
          summary: 'Old route copy',
          adultPrice: 620,
          childPrice: 510,
          infantPrice: 160,
        },
      ],
      linkedFlightGroups: [
        {
          ...source.linkedFlightGroups[0],
          options: [
            {
              ...source.linkedFlightGroups[0].options[0],
              summary: 'Old linked route copy',
              adultPrice: 240,
              childPrice: 205,
              infantPrice: 65,
            },
          ],
        },
      ],
    } as PackageQuotePayload

    const copied = copySharedPackageFlights(source, target)

    expect(copied.flightOptions[0]).toEqual(
      expect.objectContaining({
        summary: 'London to Jeddah',
        adultPrice: 620,
        childPrice: 510,
        infantPrice: 160,
      }),
    )
    expect(copied.linkedFlightGroups[0].options[0]).toEqual(
      expect.objectContaining({
        summary: 'Direct return',
        adultPrice: 240,
        childPrice: 205,
        infantPrice: 65,
      }),
    )
  })

  it('builds a customer-safe linked package group snapshot', () => {
    const group: TravelPackageGroupDetail = {
      id: 'group-1',
      group_reference: 'PTG-ABC123',
      title: 'Ali / Hussain Umrah',
      lead_package_id: 'package-1',
      lead_quote_id: null,
      status: 'active',
      customer_visibility_mode: 'linked_notice_only',
      internal_notes: 'Internal supplier cost must not appear in quote copy.',
      metadata: { sharedFlightSelection: true },
      created_by: 'agent-1',
      updated_by: 'agent-1',
      created_at: '2026-07-21T00:00:00.000Z',
      updated_at: null,
      archived_at: null,
      members: [
        {
          id: 'member-1',
          group_id: 'group-1',
          package_id: 'package-1',
          quote_id: null,
          family_label: 'Family Ali',
          customer_display_name: 'Ali family',
          is_lead_family: true,
          customer_visible: true,
          sort_order: 10,
          metadata: { packageReference: 'PT-ALI123' },
          created_at: '2026-07-21T00:00:00.000Z',
          updated_at: null,
        },
        {
          id: 'member-2',
          group_id: 'group-1',
          package_id: 'package-2',
          quote_id: null,
          family_label: 'Family Hussain',
          customer_display_name: 'Hussain family',
          is_lead_family: false,
          customer_visible: true,
          sort_order: 20,
          metadata: { packageReference: 'PT-HUS123' },
          created_at: '2026-07-21T00:00:00.000Z',
          updated_at: null,
        },
        {
          id: 'member-3',
          group_id: 'group-1',
          package_id: 'package-3',
          quote_id: null,
          family_label: 'Family Khan',
          customer_display_name: 'Khan family',
          is_lead_family: false,
          customer_visible: true,
          sort_order: 30,
          metadata: { packageReference: 'PT-KHN123' },
          created_at: '2026-07-21T00:00:00.000Z',
          updated_at: null,
        },
      ],
      sharedServices: [
        {
          id: 'service-1',
          group_id: 'group-1',
          service_type: 'transport',
          title: 'Shared transport',
          description: null,
          status: 'quoted',
          supplier_name: 'Supplier A',
          supplier_reference: null,
          currency: 'GBP',
          internal_total_cost: 850,
          customer_note: 'Transport is shared with Family Hussain / PT-HUS123.',
          allocation_mode: 'manual',
          allocation_payload: { internalOnly: true },
          customer_visible: true,
          metadata: {},
          created_by: 'agent-1',
          updated_by: 'agent-1',
          created_at: '2026-07-21T00:00:00.000Z',
          updated_at: null,
          archived_at: null,
          allocations: [
            {
              id: 'allocation-1',
              shared_service_id: 'service-1',
              group_id: 'group-1',
              package_id: 'package-1',
              quote_id: null,
              allocation_mode: 'manual',
              passenger_count: 6,
              allocated_cost: 510,
              allocated_sale_value: 0,
              internal_notes: 'Internal only',
              metadata: {},
              created_at: '2026-07-21T00:00:00.000Z',
              updated_at: null,
            },
          ],
        },
      ],
    }

    const snapshot = buildLinkedPackageGroupSnapshot(group, { packageId: 'package-1' })

    expect(snapshot.currentFamilyLabel).toBe('Family Ali')
    expect(snapshot.sharedFlightSelection).toBe(true)
    expect(snapshot.linkedFamilies).toEqual([
      expect.objectContaining({
        familyLabel: 'Family Hussain',
        packageReference: 'PT-HUS123',
        customerVisible: true,
      }),
      expect.objectContaining({
        familyLabel: 'Family Khan',
        packageReference: 'PT-KHN123',
        customerVisible: true,
      }),
    ])
    expect(snapshot.sharedServices).toEqual([
      {
        serviceType: 'transport',
        title: 'Shared transport',
        customerNote: 'Transport is shared with Family Hussain / PT-HUS123.',
        customerVisible: true,
      },
    ])
    expect(JSON.stringify(snapshot)).not.toContain('850')
    expect(JSON.stringify(snapshot)).not.toContain('510')
    expect(JSON.stringify(snapshot)).not.toContain('Internal only')
  })
})
