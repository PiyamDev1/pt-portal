import { describe, expect, it } from 'vitest'
import { branchTotals, carryBranchLedger, emptyBranchLedger } from '@/lib/accounting/ledger'
import { packageReservationLedgerAmounts } from '@/lib/accounting/ledgerSources'

describe('Accounting ledger model', () => {
  it('carries the final cash and result into the next branch month', () => {
    const current = {
      ...emptyBranchLedger(),
      cashStart: 200,
      cashEnd: 350,
      profitStart: 1_000,
      profitEnd: 1_240,
      items: [
        {
          id: 'manual-1',
          label: 'Monthly service',
          group: 'Other income',
          amount: 75,
          kind: 'income' as const,
        },
      ],
    }

    const carried = carryBranchLedger(current, '2026-09')

    expect(carried.cashStart).toBe(0)
    expect(carried.cashEnd).toBe(0)
    expect(carried.profitStart).toBe(1_240)
    expect(carried.profitEnd).toBe(1_240)
    expect(carried.items[0]).toMatchObject({
      label: 'Monthly service',
      carriedFrom: '2026-09',
    })
    expect(carried.sourceSnapshot).toEqual([])
  })

  it('includes read-only module results in branch totals without copying them into manual items', () => {
    const payload = {
      ...emptyBranchLedger(),
      profitStart: 500,
      items: [
        {
          id: 'manual-1',
          label: 'Rent',
          group: 'Operating costs',
          amount: 100,
          kind: 'expense' as const,
        },
      ],
    }
    const totals = branchTotals(payload, [
      {
        id: 'source-ticketing',
        label: 'Ticketing gross margin',
        group: 'Module profit',
        amount: 240,
        kind: 'income',
        sourceKey: 'ticketing',
      },
    ])

    expect(totals).toEqual({ income: 240, expenses: 100, net: 140, profitEnd: 640 })
    expect(payload.items).toHaveLength(1)
  })

  it('treats expected package commission as a cost before importing package profit', () => {
    expect(
      packageReservationLedgerAmounts({
        booked_cost_total: 700,
        sold_price_total: 1_000,
        discount_total: 50,
        supplier_refund_total: 100,
        customer_refund_total: 25,
        commission_expected_total: 75,
      }),
    ).toEqual({ income: 925, expenses: 675, net: 250 })
  })
})
