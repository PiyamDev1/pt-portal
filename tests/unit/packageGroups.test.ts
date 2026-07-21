import { describe, expect, it } from 'vitest'
import type { TravelPackageGroupDetail } from '@/lib/packageGroups'
import { buildLinkedPackageGroupSnapshot } from '@/lib/packageGroups'

describe('package group helpers', () => {
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
      metadata: {},
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
    expect(snapshot.linkedFamilies).toEqual([
      expect.objectContaining({
        familyLabel: 'Family Hussain',
        packageReference: 'PT-HUS123',
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
