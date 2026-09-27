import { describe, expect, it, vi } from 'vitest'
import { loadBranchModuleResults, moduleResultsToLedgerItems } from '@/lib/accounting/ledgerSources'

describe('Accounting live ledger sources', () => {
  it('uses the branch stored on the booking instead of the employee current branch', async () => {
    const calls: Array<{ table: string; op: string; args: unknown[] }> = []
    const data: Record<string, unknown[]> = {
      ticket_transactions: [
        {
          id: 'transaction-1',
          ticket_bookings: { location_id: 'branch-a' },
          ticket_passenger_fare_lines: [{ sale_total_gbp: 940, supplier_total_gbp: 832.99 }],
        },
      ],
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
      label: 'Ticketing gross margin',
      amount: 107.01,
      kind: 'income',
      sourceKey: 'ticketing',
    })
  })
})
