import { describe, expect, it, vi } from 'vitest'
import { loadBranchModuleResults, moduleResultsToLedgerItems } from '@/lib/accounting/ledgerSources'

describe('Accounting live ledger sources', () => {
  it('uses the branch stored on the booking instead of the employee current branch', async () => {
    const calls: Array<{ table: string; op: string; args: unknown[] }> = []
    const data: Record<string, unknown[]> = {
      ticket_transactions: [
        {
          id: 'transaction-1',
          ticket_bookings: {
            id: 'booking-1',
            location_id: 'branch-a',
            commission_scope: 'ticket',
            operational_status: 'issued',
            pnr: 'ABC123',
          },
          ticket_passenger_fare_lines: [{ sale_total_gbp: 940, supplier_total_gbp: 832.99 }],
        },
      ],
      ticket_refunds: [],
      travel_package_reservations: [],
      pos_transactions: [],
    }

    const from = vi.fn((table: string) => {
      const query = {
        select(columns: string) {
          calls.push({ table, op: 'select', args: [columns] })
          return query
        },
        in(column: string, values: unknown[]) {
          calls.push({ table, op: 'in', args: [column, values] })
          return query
        },
        is(column: string, value: unknown) {
          calls.push({ table, op: 'is', args: [column, value] })
          return query
        },
        gte(column: string, value: unknown) {
          calls.push({ table, op: 'gte', args: [column, value] })
          return query
        },
        lt(column: string, value: unknown) {
          calls.push({ table, op: 'lt', args: [column, value] })
          return query
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: data[table] || [], error: null }))
        },
      }
      return query
    })

    const results = await loadBranchModuleResults(
      { from } as never,
      ['branch-a', 'branch-b'],
      '2026-01',
    )
    const branchA = results.get('branch-a') || []
    const branchB = results.get('branch-b') || []

    expect(from).not.toHaveBeenCalledWith('employees')
    expect(calls).toContainEqual({
      table: 'ticket_transactions',
      op: 'in',
      args: ['ticket_bookings.location_id', ['branch-a', 'branch-b']],
    })
    expect(branchA[0]).toMatchObject({
      key: 'ticketing',
      count: 1,
      income: 940,
      expenses: 832.99,
      net: 107.01,
    })
    expect(branchB[0]).toMatchObject({ count: 0, net: 0 })
    expect(moduleResultsToLedgerItems('2026-01', branchA)[0]).toMatchObject({
      label: 'Standalone gross margin',
      amount: 107.01,
      kind: 'income',
      sourceKey: 'ticketing',
      sourceRecordCount: 1,
      dateBasis: 'booking_and_refund_confirmation_dates',
    })
  })

  it('keeps package-owned tickets and POS cash out of branch profit', async () => {
    const data: Record<string, unknown[]> = {
      ticket_transactions: [
        {
          id: 'transaction-package-ticket',
          ticket_bookings: {
            id: 'booking-package-ticket',
            location_id: 'branch-a',
            commission_scope: 'package',
            operational_status: 'issued',
            pnr: 'PKG123',
          },
          ticket_passenger_fare_lines: [{ sale_total_gbp: 900, supplier_total_gbp: 800 }],
        },
      ],
      ticket_refunds: [],
      travel_package_reservations: [
        {
          id: 'reservation-1',
          title: 'Family package',
          reservation_type: 'other',
          metadata: {},
          quote_id: null,
          group_member_id: null,
          booked_cost_total: 800,
          sold_price_total: 1200,
          discount_total: 0,
          supplier_refund_total: 0,
          customer_refund_total: 0,
          commission_expected_total: 50,
          travel_packages: {
            id: 'package-1',
            location_id: 'branch-a',
            package_reference: 'PKG-001',
          },
        },
      ],
      pos_transactions: [
        {
          id: 'pos-1',
          reference_number: 'POS-001',
          location_id: 'branch-a',
          direction: 'IN',
          total_amount: 1200,
        },
      ],
    }

    const from = vi.fn((table: string) => {
      const query = {
        select() {
          return query
        },
        in() {
          return query
        },
        is() {
          return query
        },
        gte() {
          return query
        },
        lt() {
          return query
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: data[table] || [], error: null }))
        },
      }
      return query
    })

    const results = await loadBranchModuleResults({ from } as never, ['branch-a'], '2026-01')
    const sources = results.get('branch-a') || []
    const items = moduleResultsToLedgerItems('2026-01', sources)

    expect(sources[0]).toMatchObject({ count: 0, excludedCount: 1, net: 0 })
    expect(sources[1]).toMatchObject({
      metricType: 'projected_margin',
      count: 1,
      net: 450,
      includedInBranchResult: true,
    })
    expect(sources[2]).toMatchObject({
      metricType: 'cash_movement',
      count: 1,
      net: 1200,
      includedInBranchResult: false,
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ sourceKey: 'packages', amount: 450 })
  })

  it('replaces original ticket margin with the confirmed refund result in the confirmation month', async () => {
    const data: Record<string, unknown[]> = {
      ticket_transactions: [
        {
          id: 'transaction-1',
          ticket_bookings: {
            id: 'booking-1',
            location_id: 'branch-a',
            commission_scope: 'ticket',
            operational_status: 'refunded',
            pnr: 'REF123',
          },
          ticket_passenger_fare_lines: [{ sale_total_gbp: 1_000, supplier_total_gbp: 850 }],
        },
        {
          id: 'transaction-held',
          ticket_bookings: {
            id: 'booking-held',
            location_id: 'branch-a',
            commission_scope: 'ticket',
            operational_status: 'held',
            pnr: 'HLD123',
          },
          ticket_passenger_fare_lines: [{ sale_total_gbp: 500, supplier_total_gbp: 400 }],
        },
      ],
      ticket_refunds: [
        {
          id: 'refund-confirmed',
          pnr: 'REF123',
          status: 'closed',
          commission_scope: 'ticket',
          original_sale_price_gbp: 1_000,
          original_supplier_cost_gbp: 850,
          actual_company_result_gbp: -20,
          ticket_bookings: { id: 'booking-1', location_id: 'branch-a', archived_at: null },
        },
        {
          id: 'refund-provisional',
          pnr: 'PRO123',
          status: 'settled',
          commission_scope: 'ticket',
          original_sale_price_gbp: 600,
          original_supplier_cost_gbp: 500,
          actual_company_result_gbp: null,
          ticket_bookings: { id: 'booking-2', location_id: 'branch-a', archived_at: null },
        },
        {
          id: 'refund-package',
          pnr: 'PKG123',
          status: 'closed',
          commission_scope: 'package',
          original_sale_price_gbp: 600,
          original_supplier_cost_gbp: 500,
          actual_company_result_gbp: 25,
          ticket_bookings: { id: 'booking-3', location_id: 'branch-a', archived_at: null },
        },
      ],
      travel_package_reservations: [],
      pos_transactions: [],
    }

    const from = vi.fn((table: string) => {
      const query = {
        select() {
          return query
        },
        in() {
          return query
        },
        is() {
          return query
        },
        gte() {
          return query
        },
        lt() {
          return query
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: data[table] || [], error: null }))
        },
      }
      return query
    })

    const sources = (await loadBranchModuleResults({ from } as never, ['branch-a'], '2026-01')).get(
      'branch-a',
    )
    const ticketing = sources?.[0]

    expect(ticketing).toMatchObject({
      count: 2,
      adjustmentCount: 1,
      excludedCount: 3,
      income: 1_000,
      expenses: 1_020,
      net: -20,
    })
    expect(ticketing?.references).toContainEqual({
      id: 'refund-confirmed',
      label: 'REF123 refund',
      path: '/dashboard/ticketing/refund-calculator?pnr=REF123',
    })
    expect(moduleResultsToLedgerItems('2026-01', sources || [])[0]).toMatchObject({
      sourceKey: 'ticketing',
      kind: 'expense',
      amount: 20,
    })
  })

  it('counts shared package transport once using the canonical calculation line', async () => {
    const packageRelation = {
      id: 'package-1',
      location_id: 'branch-a',
      package_reference: 'PKG-001',
    }
    const data: Record<string, unknown[]> = {
      ticket_transactions: [],
      ticket_refunds: [],
      travel_package_reservations: [
        {
          id: 'transport-main',
          title: 'Group flights',
          reservation_type: 'transport',
          metadata: {
            sharedGroupTransport: true,
            physicalReservation: true,
            soldPriceOverride: true,
          },
          quote_id: null,
          group_member_id: null,
          booked_cost_total: 800,
          sold_price_total: 1_200,
          discount_total: 0,
          supplier_refund_total: 0,
          customer_refund_total: 0,
          commission_expected_total: 0,
          travel_packages: packageRelation,
        },
        {
          id: 'transport-reference',
          title: 'Family allocation',
          reservation_type: 'transport',
          metadata: { sharedGroupTransport: true, billingAllocation: true },
          quote_id: 'quote-1',
          group_member_id: null,
          booked_cost_total: 0,
          sold_price_total: 1_200,
          discount_total: 0,
          supplier_refund_total: 0,
          customer_refund_total: 0,
          commission_expected_total: 50,
          travel_packages: packageRelation,
        },
      ],
      pos_transactions: [],
    }

    const from = vi.fn((table: string) => {
      const query = {
        select() {
          return query
        },
        in() {
          return query
        },
        is() {
          return query
        },
        gte() {
          return query
        },
        lt() {
          return query
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve(resolve({ data: data[table] || [], error: null }))
        },
      }
      return query
    })

    const packages = (
      await loadBranchModuleResults({ from } as never, ['branch-a'], '2026-01')
    ).get('branch-a')?.[1]

    expect(packages).toMatchObject({
      count: 1,
      excludedCount: 1,
      income: 1_250,
      expenses: 800,
      net: 450,
    })
  })
})
