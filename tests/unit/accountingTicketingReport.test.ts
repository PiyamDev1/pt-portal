import { describe, expect, it } from 'vitest'
import {
  buildAccountingTicketingReport,
  type NormalizedTicketingTransaction,
} from '@/lib/accounting/ticketingReports'

const branches = [
  { id: 'hq', name: 'Head Office', branchCode: 'HQ-001' },
  { id: 'luton', name: 'Luton Office', branchCode: 'UK001' },
  { id: 'islamabad', name: 'Islamabad', branchCode: 'PK001' },
]

function transaction(
  overrides: Partial<NormalizedTicketingTransaction> = {},
): NormalizedTicketingTransaction {
  return {
    id: 'transaction-1',
    bookingId: 'booking-1',
    branchId: 'hq',
    pnr: 'ABC123',
    customerName: 'Test Customer',
    airlineCode: 'EY',
    airlineName: 'Etihad Airways',
    ownerName: 'Agent One',
    bookingDate: '2026-01-12',
    serviceType: 'TK',
    operationalStatus: 'issued',
    paymentStatus: 'paid',
    passengerCount: 1,
    saleGbp: 500,
    supplierCostGbp: 450,
    ...overrides,
  }
}

describe('Accounting ticketing report', () => {
  it('groups live booking data by recorded branch, airline and month', () => {
    const report = buildAccountingTicketingReport({
      branches,
      year: 2026,
      branchId: 'all',
      service: 'all',
      transactions: [
        transaction(),
        transaction({
          id: 'transaction-2',
          bookingId: 'booking-2',
          branchId: 'luton',
          bookingDate: '2026-02-08',
          airlineCode: 'TK',
          airlineName: 'Turkish Airlines',
          paymentStatus: 'unpaid',
          operationalStatus: 'held',
          passengerCount: 2,
          saleGbp: 940,
          supplierCostGbp: 832.99,
        }),
      ],
    })

    expect(report.totals).toMatchObject({
      transactions: 2,
      passengerTickets: 3,
      saleGbp: 1_440,
      supplierCostGbp: 1_282.99,
      grossProfitGbp: 157.01,
      paid: 1,
      partial: 0,
      unpaid: 1,
      held: 1,
    })
    expect(report.months[0]).toMatchObject({
      transactions: 1,
      passengerTickets: 1,
      grossProfitGbp: 50,
    })
    expect(report.months[1]).toMatchObject({
      transactions: 1,
      passengerTickets: 2,
      grossProfitGbp: 107.01,
    })
    expect(report.sections).toHaveLength(3)
    expect(report.sections[0].branch.name).toBe('Head Office')
    expect(report.sections[0].rows[0].tickets[0]).toMatchObject({
      pnr: 'ABC123',
      saleGbp: 500,
      supplierCostGbp: 450,
      grossProfitGbp: 50,
    })
    expect(report.sections[2]).toMatchObject({
      branch: { name: 'Islamabad' },
      transactions: 0,
      rows: [],
    })
  })

  it('shows only the requested branch while retaining the live branch selector options', () => {
    const report = buildAccountingTicketingReport({
      branches,
      year: 2026,
      branchId: 'luton',
      service: 'TK',
      transactions: [transaction({ branchId: 'luton' })],
    })

    expect(report.branches).toEqual(branches)
    expect(report.sections).toHaveLength(1)
    expect(report.sections[0].branch.id).toBe('luton')
  })

  it('excludes records outside the selected calendar year', () => {
    const report = buildAccountingTicketingReport({
      branches,
      year: 2026,
      branchId: 'all',
      service: 'all',
      transactions: [transaction({ bookingDate: '2025-12-31' })],
    })

    expect(report.totals.transactions).toBe(0)
    expect(report.totals.busiestMonth).toBeNull()
  })

  it('keeps partial payments separate from unpaid transactions', () => {
    const report = buildAccountingTicketingReport({
      branches,
      year: 2026,
      branchId: 'all',
      service: 'all',
      transactions: [transaction({ paymentStatus: 'part_paid' })],
    })

    expect(report.totals).toMatchObject({ paid: 0, partial: 1, unpaid: 0 })
    expect(report.months[0]).toMatchObject({ paid: 0, partial: 1, unpaid: 0 })
  })
})
